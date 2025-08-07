import regex # Use the third-party regex library for \p{L} support
import json
from collections import defaultdict, Counter # Import Counter
import time # For simulating API delay and rate limiting
import os   # To check for file existence and paths (Replaced non-breaking space)
import sys  # To exit gracefully on error
import asyncio # For parallel processing
import argparse # For command-line arguments
import google.generativeai as genai # Import the Gemini library
from google.generativeai.types import HarmCategory, HarmBlockThreshold # For safety settings

# --- Configuration ---

# !!! PASTE YOUR GEMINI API KEY HERE !!!
# It's recommended to use environment variables or a config file for API keys
# instead of hardcoding them directly in the script.
LLM_API_KEY = "AIzaSyC8K77ZRJjrelyDV2znFEzevsFWrUh4Kp8" # Replace with your actual key

# --- File Path Setup ---
# Get the directory where the script itself is located
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
# Assume the script is in the 'backend' folder, and 'data' is a subfolder
DATA_DIR = os.path.join(SCRIPT_DIR, 'data')
# Path to the shared data file used by the Node.js backend
COMBINED_DATA_FILE_PATH = os.path.join(DATA_DIR, 'combinedData.json')

# Default values, can be overridden by command line args
# Assume prompt template is in the SAME directory as the script
DEFAULT_PROMPT_TEMPLATE_FILE = os.path.join(SCRIPT_DIR, "prompt_template.txt")
# Default input text file (example path, adjust if needed or rely on args)
DEFAULT_INPUT_TEXT_FILE = os.path.join(SCRIPT_DIR, "..", "input1000.txt") # Assumes input is outside 'backend'
# Default output JSON file (will often be overridden to COMBINED_DATA_FILE_PATH)
DEFAULT_OUTPUT_JSON_FILE = os.path.join(SCRIPT_DIR, 'output_processed_text_parallel.json')
# Default log file path (in the same directory as the script)
DEFAULT_FAILED_BATCHES_LOG = os.path.join(SCRIPT_DIR, "failed_batches_log.txt")

# --- Batching Parameters ---
DEFAULT_TARGET_WORDS_PER_BATCH = 30
DEFAULT_BACKWARD_SEARCH_RANGE = 5 # Defined constant
DEFAULT_FORWARD_SEARCH_RANGE = 15 # Defined constant

# --- LLM Configuration ---
DEFAULT_GEMINI_MODEL_NAME = "gemini-2.0-flash" # Updated model name
# Safety settings to block harmful content (adjust thresholds as needed)
SAFETY_SETTINGS = {
    HarmCategory.HARM_CATEGORY_HARASSMENT: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE,
    HarmCategory.HARM_CATEGORY_HATE_SPEECH: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE,
    HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE,
    HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE,
}
# Generation config to request JSON output
GENERATION_CONFIG = {
    "response_mime_type": "application/json",
}
MAX_API_RETRIES = 3 # Using 6 retries for API call failures
MAX_VALIDATION_RETRIES = 6 # Using 6 retries for validation failures
RETRY_DELAY_SECONDS = 5 # Base delay before retrying after validation failure
API_RETRY_DELAY_SECONDS = 10 # Longer base delay for API errors like rate limits

# --- Concurrency Control ---
# Limit concurrent API calls to stay under the model's limits (adjust as needed)
DEFAULT_MAX_CONCURRENT_API_CALLS = 5 # Flash models often have higher limits, but start conservative

# --- Reprocessing Context ---
CONTEXT_WORD_WINDOW = 5 # Words before/after for small range reprocessing
MIN_RANGE_FOR_CONTEXT = 7 # If range is smaller than this, add context

# --- Constants ---
# Regex for tokenization - Using \p{L} for Unicode letters (requires 'regex' library)
TOKEN_REGEX = r"([\p{L}'']+)|(\s+)|(\n+)|([^\p{L}\s\n'']+)" # Reverted to original regex

# --- Global State Variables ---
# These will be accessed by multiple async tasks, requiring locking for writes
global_database = {} # key: wordPos (int), value: word data dict
global_segment_database = [] # list of segment data dicts
global_idiom_database = [] # list of idiom data dicts
global_known_words = [] # List of known word signatures (word::POS)
all_tokens = [] # list of token dicts {type: str, text: str, wordPos: int|None, lowerWord: str|None}
global_word_counter = 0
loaded_prompt_template = "" # Will be loaded from file
gemini_model = None # Will be initialized after API key configuration
total_batches = 0 # Global for logging in async tasks
args = None # To store command line arguments

# --- Utility Functions ---
def exit_with_error(message):
    """Prints an error message and exits the script."""
    print("="*50)
    print(f"ERROR: {message}")
    print("="*50)
    sys.exit(1) # Exit with a non-zero status code

# --- Core Logic Functions ---

def load_progress(filename):
    """Loads progress from a JSON file."""
    global global_database, global_segment_database, global_idiom_database, global_known_words
    try:
        with open(filename, 'r', encoding='utf-8') as f:
            data = json.load(f)
        # Basic structure validation
        if not all(k in data for k in ['inputText', 'wordDatabase', 'segments', 'idioms', 'knownWords']): # Added knownWords check
            print(f"Warning: Resume file '{filename}' is missing required keys. Cannot resume.")
            return None, False # Return None for text, False for success

        # Load data into global variables
        # Convert string keys back to int for wordDatabase
        global_database = {int(k): v for k, v in data.get('wordDatabase', {}).items() if k.isdigit()}
        global_segment_database = data.get('segments', [])
        global_idiom_database = data.get('idioms', [])
        global_known_words = data.get('knownWords', []) # Load known words
        input_text = data.get('inputText', '') # Get the original text

        if not input_text:
            print(f"Warning: Resume file '{filename}' is missing 'inputText'. Cannot proceed with resume.")
            return None, False

        print(f"Successfully loaded progress from '{filename}'.")
        print(f"  Loaded {len(global_database)} word entries, {len(global_segment_database)} segments, {len(global_idiom_database)} idioms, {len(global_known_words)} known words.")
        return input_text, True # Return the text associated with the loaded data and success flag
    except FileNotFoundError:
        print(f"Progress file '{filename}' not found. Cannot resume.")
        return None, False
    except json.JSONDecodeError as e:
        print(f"Error decoding JSON from '{filename}': {e}. Cannot resume.")
        return None, False
    except Exception as e:
        print(f"Error loading progress from '{filename}': {e}. Cannot resume.")
        return None, False

def tokenize_text_only(text):
    """
    Tokenizes text using the enhanced regex library.
    Populates the global all_tokens list and sets global_word_counter.
    Does NOT modify the global_database. Used when resuming.
    """
    global all_tokens, global_word_counter
    all_tokens = [] # Reset token list
    current_word_index = 0
    print("Tokenizing text from loaded file (for splitting)...")

    for match in regex.finditer(TOKEN_REGEX, text):
        token_text = match.group(0)
        token = {'text': token_text, 'type': 'unknown', 'wordPos': None, 'lowerWord': None}

        # Determine token type based on which group matched
        wordGroup = match.group(1)
        spaceGroup = match.group(2)
        newlineGroup = match.group(3)
        nonWordGroup = match.group(4)

        if wordGroup: # Group 1: Unicode letters or apostrophe
            token['type'] = 'word'
            current_word_index += 1
            token['wordPos'] = current_word_index
            token['lowerWord'] = token_text.lower()
            # No database interaction here
        elif spaceGroup: token['type'] = 'whitespace'
        elif newlineGroup: token['type'] = 'newline'
        elif nonWordGroup: token['type'] = 'punctuation'
        # else: token['type'] = 'punctuation' # Covered by nonWordGroup

        all_tokens.append(token)

    global_word_counter = current_word_index
    print(f"Tokenization complete. Words found: {global_word_counter}")


def tokenize_and_ensure_word_entries(text):
    """
    Tokenizes text AND creates/updates placeholder entries in global_database.
    Used when starting from scratch.
    """
    global all_tokens, global_word_counter, global_database
    new_word_database = {}
    all_tokens = [] # Reset token list
    current_word_index = 0
    print("Tokenizing text and ensuring word entries (using 'regex' library)...")

    for match in regex.finditer(TOKEN_REGEX, text):
        token_text = match.group(0)
        token = {'text': token_text, 'type': 'unknown', 'wordPos': None, 'lowerWord': None}

        # Determine token type based on which group matched
        wordGroup = match.group(1)
        spaceGroup = match.group(2)
        newlineGroup = match.group(3)
        nonWordGroup = match.group(4)

        if wordGroup: # Group 1: Unicode letters or apostrophe
            token['type'] = 'word'
            current_word_index += 1
            token['wordPos'] = current_word_index
            token['lowerWord'] = token_text.lower()
            # Create placeholder entry for every word instance
            # Check if it exists from a previous run (less likely now but safe)
            if token['wordPos'] in global_database:
                 new_word_database[token['wordPos']] = {
                     **global_database[token['wordPos']], # Keep existing data
                     'word': token_text # Update word to match current token exactly
                 }
            else:
                 new_word_database[token['wordPos']] = {
                     'word': token_text, # Store original case word
                     'pos': "TBD", 'lemma': "TBD",
                     'best_translation': "TBD", 'possible_translations': [],
                     'details': {}, 'freq': "TBD", 'freq_till_now': "TBD",
                     'first_inst': "TBD", 'lemma_translations': [],
                     'most_frequent_lemma': "TBD" # Initialize new field
                 }
        elif spaceGroup: token['type'] = 'whitespace'
        elif newlineGroup: token['type'] = 'newline'
        elif nonWordGroup:
            token['type'] = 'punctuation'
            # Optionally create entries for punctuation if needed by LLM
            # current_word_index += 1
            # token['wordPos'] = current_word_index
            # new_word_database[token['wordPos']] = {'word': token_text, 'pos': 'PUNCT', ...}
        # else: token['type'] = 'punctuation' # Covered by nonWordGroup

        all_tokens.append(token)

    # Update the global database (which was reset before this call)
    global_database.update(new_word_database)
    global_word_counter = current_word_index # Set the final count
    print(f"Tokenization complete. Words found: {global_word_counter}")
    # **DEBUG LOG 1**
    print(f"DEBUG: global_database contains {len(global_database)} entries after tokenization.")
    db_keys = sorted(global_database.keys())
    if len(db_keys) > 10: print(f"DEBUG: Keys sample: {db_keys[:5]} ... {db_keys[-5:]}")
    else: print(f"DEBUG: Keys: {db_keys}")


def save_progress(output_file):
    """Saves the current state to a JSON file."""
    global global_database, global_segment_database, global_idiom_database, global_known_words, all_tokens
    
    # Reconstruct the input text from tokens
    input_text = ''.join(token['text'] for token in all_tokens)
    
    data = {
        'inputText': input_text,
        'wordDatabase': global_database,
        'segments': global_segment_database,
        'idioms': global_idiom_database,
        'knownWords': global_known_words
    }
    
    try:
        with open(output_file, 'w', encoding='utf-8') as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
        print(f"Progress saved to '{output_file}'.")
        return True
    except Exception as e:
        print(f"Error saving progress to '{output_file}': {e}")
        return False

def main():
    """Main function to handle command line arguments and execute the script."""
    global args
    
    parser = argparse.ArgumentParser(description='Process text with LLM for linguistic analysis')
    parser.add_argument('--initialize-only', action='store_true', help='Only initialize the database structure without processing')
    parser.add_argument('--input', type=str, help='Input text file path')
    parser.add_argument('--output', type=str, help='Output JSON file path')
    
    args = parser.parse_args()
    
    if args.initialize_only:
        # Initialize mode - just create the basic structure
        if not args.input:
            exit_with_error("--input is required for initialization")
        if not args.output:
            exit_with_error("--output is required for initialization")
            
        try:
            # Read input text
            with open(args.input, 'r', encoding='utf-8') as f:
                input_text = f.read().strip()
            
            if not input_text:
                exit_with_error("Input text file is empty")
            
            print(f"Initializing database structure for text: '{input_text[:50]}...'")
            
            # Reset global state
            global global_database, global_segment_database, global_idiom_database, global_known_words
            global_database = {}
            global_segment_database = []
            global_idiom_database = []
            global_known_words = []
            
            # Tokenize and create word entries
            tokenize_and_ensure_word_entries(input_text)
            
            # Save the initialized structure
            if save_progress(args.output):
                print(f"✓ Initialization complete. {len(global_database)} words found in '{os.path.basename(args.input)}'")
                sys.exit(0)
            else:
                exit_with_error("Failed to save initialized database")
                
        except FileNotFoundError:
            exit_with_error(f"Input file not found: {args.input}")
        except Exception as e:
            exit_with_error(f"Initialization failed: {e}")
    else:
        exit_with_error("Currently only --initialize-only mode is supported")

if __name__ == "__main__":
    main()