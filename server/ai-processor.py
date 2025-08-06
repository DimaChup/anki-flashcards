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

# API Key Configuration - Multiple Options for Multi-User Setup
# 1. Environment variable (recommended for deployment)
# 2. User-provided key in processing config
# 3. Fallback to empty (will show clear error message)
LLM_API_KEY = os.environ.get('GEMINI_API_KEY', '')

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


def find_split_points(target_word_count, backward_range, forward_range):
    """Finds optimal split points (token indices)."""
    global all_tokens, global_word_counter
    split_points = []
    current_word_count = 0
    last_split_idx = -1
    total_words = global_word_counter
    if total_words == 0: return []
    print(f"Finding split points: Target={target_word_count}, B={backward_range}, F={forward_range}")
    loop_guard = 0
    while current_word_count < total_words:
        loop_guard += 1
        if loop_guard > len(all_tokens) * 2:
            print("Error: Potential infinite loop in find_split_points. Breaking.")
            if last_split_idx < len(all_tokens) - 1: split_points.append(len(all_tokens) - 1)
            break
        target_pos = current_word_count + target_word_count
        if target_pos >= total_words:
            split_points.append(len(all_tokens) - 1)
            break
        min_pos = max(current_word_count + 1, target_pos - backward_range)
        max_pos = min(total_words, target_pos + forward_range)
        min_token_idx, max_token_idx, target_token_idx = -1, -1, -1
        for i in range(last_split_idx + 1, len(all_tokens)):
            token = all_tokens[i]
            if token['type'] == 'word':
                wp = token['wordPos']
                if min_token_idx == -1 and wp >= min_pos: min_token_idx = i
                if wp == target_pos: target_token_idx = i
                if wp <= max_pos: max_token_idx = i
        if min_token_idx == -1: min_token_idx = len(all_tokens) - 1
        if max_token_idx == -1: max_token_idx = len(all_tokens) - 1
        if target_token_idx == -1: target_token_idx = min_token_idx
        
        best_idx = find_best_split_in_range(min_token_idx, max_token_idx, target_token_idx)
        split_points.append(best_idx)
        words_up_to_split = sum(1 for i in range(0, best_idx + 1) if all_tokens[i]['type'] == 'word')
        current_word_count = words_up_to_split
        last_split_idx = best_idx
        print(f"  Split point {len(split_points)}: token {best_idx}, words up to here: {current_word_count}")
    
    return split_points

def find_best_split_in_range(min_idx, max_idx, target_idx):
    """Find the best split point within a range, preferring sentence boundaries."""
    global all_tokens
    
    sentence_endings = {'.', '!', '?', ':', ';'}
    paragraph_endings = {'\n\n', '\n \n', '\n  \n'}
    
    # First, look for paragraph breaks within range
    for i in range(target_idx, min(max_idx + 1, len(all_tokens))):
        if all_tokens[i]['type'] == 'newline' and all_tokens[i]['text'] in paragraph_endings:
            return i
    for i in range(target_idx - 1, max(min_idx - 1, -1), -1):
        if all_tokens[i]['type'] == 'newline' and all_tokens[i]['text'] in paragraph_endings:
            return i
    
    # Then look for sentence endings
    for i in range(target_idx, min(max_idx + 1, len(all_tokens))):
        if all_tokens[i]['type'] == 'punctuation' and all_tokens[i]['text'] in sentence_endings:
            return i
    for i in range(target_idx - 1, max(min_idx - 1, -1), -1):
        if all_tokens[i]['type'] == 'punctuation' and all_tokens[i]['text'] in sentence_endings:
            return i
    
    # Finally, look for any punctuation
    for i in range(target_idx, min(max_idx + 1, len(all_tokens))):
        if all_tokens[i]['type'] == 'punctuation':
            return i
    for i in range(target_idx - 1, max(min_idx - 1, -1), -1):
        if all_tokens[i]['type'] == 'punctuation':
            return i
    
    # If no good split found, return target
    return target_idx

def extract_batch_text(start_idx, end_idx):
    """Extract text for a batch given token indices."""
    global all_tokens
    if start_idx >= len(all_tokens) or end_idx >= len(all_tokens):
        return ""
    return ''.join(token['text'] for token in all_tokens[start_idx:end_idx + 1])

def extract_batch_word_positions(start_idx, end_idx):
    """Extract word positions for tokens in a batch."""
    global all_tokens
    positions = []
    for i in range(start_idx, min(end_idx + 1, len(all_tokens))):
        if all_tokens[i]['type'] == 'word':
            positions.append(all_tokens[i]['wordPos'])
    return positions

def is_batch_already_processed(word_positions):
    """Check if all words in a batch have been processed (non-TBD values)."""
    global global_database
    
    for pos in word_positions:
        if pos not in global_database:
            return False
        word_data = global_database[pos]
        # Check if any core field is still TBD
        if (word_data.get('pos') == 'TBD' or 
            word_data.get('lemma') == 'TBD' or 
            word_data.get('best_translation') == 'TBD'):
            return False
    return True

async def process_batch_with_llm(batch_number, start_idx, end_idx, semaphore):
    """Process a single batch with the LLM."""
    global global_database, gemini_model, loaded_prompt_template, total_batches
    
    async with semaphore:  # Limit concurrent API calls
        batch_text = extract_batch_text(start_idx, end_idx)
        word_positions = extract_batch_word_positions(start_idx, end_idx)
        
        print(f"[Batch {batch_number}/{total_batches}] Processing {len(word_positions)} words...")
        
        # Check if batch is already processed
        if is_batch_already_processed(word_positions):
            print(f"[Batch {batch_number}/{total_batches}] Already processed, skipping.")
            return True
        
        # Prepare the prompt
        full_prompt = loaded_prompt_template.replace("{TEXT_SEGMENT}", batch_text)
        
        success = False
        last_error = None
        
        # API retry loop
        for api_attempt in range(MAX_API_RETRIES):
            try:
                # Make API call
                response = await asyncio.to_thread(
                    gemini_model.generate_content,
                    full_prompt
                )
                
                if not response.text:
                    raise Exception("Empty response from API")
                
                # Validation retry loop
                validation_success = False
                for validation_attempt in range(MAX_VALIDATION_RETRIES):
                    try:
                        # Parse JSON response
                        response_data = json.loads(response.text)
                        
                        # Update global database
                        await update_database_from_response(response_data, word_positions)
                        validation_success = True
                        break
                        
                    except json.JSONDecodeError as e:
                        print(f"[Batch {batch_number}] JSON decode error (attempt {validation_attempt + 1}): {e}")
                        if validation_attempt < MAX_VALIDATION_RETRIES - 1:
                            await asyncio.sleep(RETRY_DELAY_SECONDS)
                        last_error = e
                    except Exception as e:
                        print(f"[Batch {batch_number}] Validation error (attempt {validation_attempt + 1}): {e}")
                        if validation_attempt < MAX_VALIDATION_RETRIES - 1:
                            await asyncio.sleep(RETRY_DELAY_SECONDS)
                        last_error = e
                
                if validation_success:
                    success = True
                    break
                    
            except Exception as e:
                print(f"[Batch {batch_number}] API error (attempt {api_attempt + 1}): {e}")
                if api_attempt < MAX_API_RETRIES - 1:
                    await asyncio.sleep(API_RETRY_DELAY_SECONDS)
                last_error = e
        
        if success:
            print(f"[Batch {batch_number}/{total_batches}] ✓ Completed successfully")
            return True
        else:
            print(f"[Batch {batch_number}/{total_batches}] ✗ Failed after all retries: {last_error}")
            await log_failed_batch(batch_number, start_idx, end_idx, str(last_error))
            return False

async def update_database_from_response(response_data, word_positions):
    """Update the global database with LLM response data."""
    global global_database
    
    if 'words' not in response_data:
        raise ValueError("Response missing 'words' field")
    
    words_data = response_data['words']
    
    for word_info in words_data:
        # Find matching word position
        word_text = word_info.get('word', '').lower()
        
        # Try to match by position first, then by word text
        matched_pos = None
        for pos in word_positions:
            if pos in global_database:
                if global_database[pos]['word'].lower() == word_text:
                    matched_pos = pos
                    break
        
        if matched_pos:
            # Update the word entry
            global_database[matched_pos].update({
                'pos': word_info.get('pos', 'TBD'),
                'lemma': word_info.get('lemma', 'TBD'),
                'best_translation': word_info.get('best_translation', 'TBD'),
                'possible_translations': word_info.get('possible_translations', []),
                'details': word_info.get('details', {}),
                'freq': word_info.get('freq', 'TBD'),
                'lemma_translations': word_info.get('lemma_translations', []),
                'most_frequent_lemma': word_info.get('most_frequent_lemma', 'TBD')
            })

async def log_failed_batch(batch_number, start_idx, end_idx, error_msg):
    """Log failed batch details to a file."""
    log_entry = {
        'batch_number': batch_number,
        'start_idx': start_idx,
        'end_idx': end_idx,
        'error': error_msg,
        'timestamp': time.time()
    }
    
    try:
        # Append to log file
        with open(DEFAULT_FAILED_BATCHES_LOG, 'a', encoding='utf-8') as f:
            f.write(json.dumps(log_entry) + '\n')
    except Exception as e:
        print(f"Failed to log error for batch {batch_number}: {e}")

def save_progress_to_file(output_file):
    """Save current progress to a JSON file."""
    global global_database, global_segment_database, global_idiom_database, global_known_words, args
    
    # Get the original input text
    input_text = ""
    if args and args.input_text_file:
        try:
            with open(args.input_text_file, 'r', encoding='utf-8') as f:
                input_text = f.read()
        except Exception as e:
            print(f"Warning: Could not read input text file: {e}")
    
    # Prepare the output data structure
    output_data = {
        'inputText': input_text,
        'wordDatabase': {str(k): v for k, v in global_database.items()},  # Convert int keys to strings
        'segments': global_segment_database,
        'idioms': global_idiom_database,
        'knownWords': global_known_words
    }
    
    try:
        # Ensure the directory exists
        os.makedirs(os.path.dirname(output_file), exist_ok=True)
        
        # Write to file
        with open(output_file, 'w', encoding='utf-8') as f:
            json.dump(output_data, f, ensure_ascii=False, indent=2)
        
        print(f"Progress saved to: {output_file}")
        return True
    except Exception as e:
        print(f"Error saving progress to {output_file}: {e}")
        return False

async def process_text_parallel():
    """Main processing function."""
    global global_database, global_segment_database, global_idiom_database
    global all_tokens, global_word_counter, gemini_model, loaded_prompt_template
    global total_batches, args
    
    print("Starting parallel text processing...")
    
    # Load or initialize data
    input_text = ""
    if args.resume_file and os.path.exists(args.resume_file):
        input_text, resume_success = load_progress(args.resume_file)
        if resume_success:
            tokenize_text_only(input_text)  # Just tokenize for splitting
        else:
            return False
    else:
        # Load input text
        try:
            with open(args.input_text_file, 'r', encoding='utf-8') as f:
                input_text = f.read()
        except Exception as e:
            exit_with_error(f"Could not read input file {args.input_text_file}: {e}")
        
        # Reset databases and tokenize
        global_database = {}
        global_segment_database = []
        global_idiom_database = []
        tokenize_and_ensure_word_entries(input_text)
    
    # Find split points for batching
    split_points = find_split_points(
        args.target_words_per_batch,
        args.backward_search_range,
        args.forward_search_range
    )
    
    if not split_points:
        print("No split points found. Text might be too short.")
        return False
    
    total_batches = len(split_points)
    print(f"Will process {total_batches} batches with max {args.max_concurrent_api_calls} concurrent calls")
    
    # Create semaphore for concurrency control
    semaphore = asyncio.Semaphore(args.max_concurrent_api_calls)
    
    # Process batches
    tasks = []
    start_idx = 0
    
    for i, end_idx in enumerate(split_points):
        batch_number = i + 1
        task = process_batch_with_llm(batch_number, start_idx, end_idx, semaphore)
        tasks.append(task)
        start_idx = end_idx + 1
    
    # Wait for all batches to complete
    results = await asyncio.gather(*tasks, return_exceptions=True)
    
    # Count successes and failures
    successes = sum(1 for r in results if r is True)
    failures = len(results) - successes
    
    print(f"\nProcessing complete: {successes} successful, {failures} failed batches")
    
    # Save progress
    save_success = save_progress_to_file(args.output_json_file)
    
    return save_success and failures == 0

def parse_arguments():
    """Parse command line arguments."""
    parser = argparse.ArgumentParser(description='Process text with LLM in parallel batches')
    
    parser.add_argument('--input-text-file', default=DEFAULT_INPUT_TEXT_FILE,
                        help='Path to input text file')
    parser.add_argument('--output-json-file', default=DEFAULT_OUTPUT_JSON_FILE,
                        help='Path to output JSON file')
    parser.add_argument('--prompt-template-file', default=DEFAULT_PROMPT_TEMPLATE_FILE,
                        help='Path to prompt template file')
    parser.add_argument('--resume-file', default=None,
                        help='Path to existing JSON file to resume from')
    parser.add_argument('--target-words-per-batch', type=int, default=DEFAULT_TARGET_WORDS_PER_BATCH,
                        help='Target number of words per batch')
    parser.add_argument('--backward-search-range', type=int, default=DEFAULT_BACKWARD_SEARCH_RANGE,
                        help='Backward search range for split points')
    parser.add_argument('--forward-search-range', type=int, default=DEFAULT_FORWARD_SEARCH_RANGE,
                        help='Forward search range for split points')
    parser.add_argument('--max-concurrent-api-calls', type=int, default=DEFAULT_MAX_CONCURRENT_API_CALLS,
                        help='Maximum concurrent API calls')
    parser.add_argument('--gemini-model', default=DEFAULT_GEMINI_MODEL_NAME,
                        help='Gemini model name to use')
    parser.add_argument('--api-key', default=None,
                        help='Gemini API key (overrides LLM_API_KEY)')
    
    return parser.parse_args()

def initialize_gemini_client(api_key, model_name):
    """Initialize the Gemini client."""
    global gemini_model
    
    try:
        genai.configure(api_key=api_key)
        gemini_model = genai.GenerativeModel(
            model_name=model_name,
            safety_settings=SAFETY_SETTINGS,
            generation_config=GENERATION_CONFIG
        )
        print(f"Initialized Gemini model: {model_name}")
        return True
    except Exception as e:
        exit_with_error(f"Failed to initialize Gemini client: {e}")

def load_prompt_template(template_file):
    """Load the prompt template from file."""
    global loaded_prompt_template
    
    try:
        with open(template_file, 'r', encoding='utf-8') as f:
            loaded_prompt_template = f.read()
        print(f"Loaded prompt template from: {template_file}")
        return True
    except Exception as e:
        exit_with_error(f"Could not load prompt template from {template_file}: {e}")

async def main():
    """Main entry point."""
    global args
    
    print("=== LLM Text Processor ===")
    
    # Check if called from Node.js with config (new web app mode)
    if len(sys.argv) >= 3:
        job_id = sys.argv[1]
        config_json = sys.argv[2]
        config = json.loads(config_json)
        
        print(f"Starting processing job {job_id} with web app configuration")
        
        # Extract configuration from control panel
        api_key = config.get('api_key') or LLM_API_KEY or os.getenv('GEMINI_API_KEY')
        if not api_key:
            exit_with_error("No API key provided. Please set GEMINI_API_KEY environment variable or provide API key in processing config.")
        
        model_name = config.get('model_name', DEFAULT_GEMINI_MODEL_NAME)
        prompt_template = config.get('prompt_template', '')
        
        # Initialize components for web app mode
        initialize_gemini_client(api_key, model_name)
        
        # Use prompt template from config instead of file
        global loaded_prompt_template
        loaded_prompt_template = prompt_template
        print(f"Using prompt template from control panel")
        
        # TODO: Implement web app database processing logic here
        print(f"Processing database_id: {config.get('database_id')}")
        print(f"Batch size: {config.get('batch_size', 30)}")
        print(f"Concurrency: {config.get('concurrency', 5)}")
        
        return True
    
    # Original command-line mode
    # Parse arguments
    args = parse_arguments()
    
    # Determine API key
    api_key = args.api_key or LLM_API_KEY or os.getenv('GEMINI_API_KEY')
    if not api_key:
        exit_with_error("No API key provided. Set LLM_API_KEY in script, use --api-key argument, or set GEMINI_API_KEY environment variable.")
    
    # Initialize components
    initialize_gemini_client(api_key, args.gemini_model)
    load_prompt_template(args.prompt_template_file)
    
    # Process text
    success = await process_text_parallel()
    
    if success:
        print("✓ Processing completed successfully!")
        sys.exit(0)
    else:
        print("✗ Processing failed!")
        sys.exit(1)

if __name__ == "__main__":
    asyncio.run(main())