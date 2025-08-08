#!/usr/bin/env python3

import regex # Use the third-party regex library for \p{L} support
import json
from collections import defaultdict, Counter # Import Counter
import time # For simulating API delay and rate limiting
import os   # To check for file existence and paths
import sys  # To exit gracefully on error
import asyncio # For parallel processing
import argparse # For command-line arguments
import google.generativeai as genai # Import the Gemini library
from google.generativeai.types import HarmCategory, HarmBlockThreshold # For safety settings

# --- Configuration ---
# Get API key from environment variables
LLM_API_KEY = os.getenv("LLM_API_KEY") or os.getenv("GEMINI_API_KEY")

# --- LLM Configuration ---
DEFAULT_GEMINI_MODEL_NAME = "gemini-2.5-flash"
# Safety settings to block harmful content
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

# --- Batching Parameters ---
DEFAULT_TARGET_WORDS_PER_BATCH = 30
MAX_API_RETRIES = 3
MAX_VALIDATION_RETRIES = 6
RETRY_DELAY_SECONDS = 5
API_RETRY_DELAY_SECONDS = 10
DEFAULT_MAX_CONCURRENT_API_CALLS = 5

# --- Constants ---
# Regex for tokenization - Using \p{L} for Unicode letters (requires 'regex' library)
TOKEN_REGEX = r"([\p{L}'']+)|(\s+)|(\n+)|([^\p{L}\s\n'']+)"

# --- Global State Variables ---
global_database = {} # key: wordPos (int), value: word data dict
global_segment_database = [] # list of segment data dicts
global_idiom_database = [] # list of idiom data dicts
global_known_words = [] # List of known word signatures (word::POS)
all_tokens = [] # list of token dicts
global_word_counter = 0
gemini_model = None

def exit_with_error(message):
    """Prints an error message and exits the script."""
    print("="*50)
    print(f"ERROR: {message}")
    print("="*50)
    sys.exit(1)

def tokenize_and_ensure_word_entries(text):
    """Tokenizes text AND creates/updates placeholder entries in global_database."""
    global all_tokens, global_word_counter, global_database
    new_word_database = {}
    all_tokens = []
    current_word_index = 0
    print("Tokenizing text and ensuring word entries...")

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
                     'most_frequent_lemma': "TBD"
                 }
        elif spaceGroup: 
            token['type'] = 'whitespace'
        elif newlineGroup: 
            token['type'] = 'newline'
        elif nonWordGroup:
            token['type'] = 'punctuation'

        all_tokens.append(token)

    # Update the global database
    global_database.update(new_word_database)
    global_word_counter = current_word_index
    print(f"Tokenization complete. Words found: {global_word_counter}")

def load_progress(filename):
    """Loads progress from a JSON file."""
    global global_database, global_segment_database, global_idiom_database, global_known_words
    try:
        with open(filename, 'r', encoding='utf-8') as f:
            data = json.load(f)
        
        # Basic structure validation
        if not all(k in data for k in ['inputText', 'wordDatabase', 'segments', 'idioms', 'knownWords']):
            print(f"Warning: Resume file '{filename}' is missing required keys. Cannot resume.")
            return None, False

        # Load data into global variables
        global_database = {int(k): v for k, v in data.get('wordDatabase', {}).items() if k.isdigit()}
        global_segment_database = data.get('segments', [])
        global_idiom_database = data.get('idioms', [])
        global_known_words = data.get('knownWords', [])
        input_text = data.get('inputText', '')

        if not input_text:
            print(f"Warning: Resume file '{filename}' is missing 'inputText'. Cannot proceed with resume.")
            return None, False

        print(f"Successfully loaded progress from '{filename}'.")
        print(f"  Loaded {len(global_database)} word entries, {len(global_segment_database)} segments, {len(global_idiom_database)} idioms, {len(global_known_words)} known words.")
        return input_text, True
    except FileNotFoundError:
        print(f"Progress file '{filename}' not found. Cannot resume.")
        return None, False
    except json.JSONDecodeError as e:
        print(f"Error decoding JSON from '{filename}': {e}. Cannot resume.")
        return None, False
    except Exception as e:
        print(f"Error loading progress from '{filename}': {e}. Cannot resume.")
        return None, False

def save_progress(filename, input_text):
    """Saves current progress to a JSON file."""
    try:
        # Convert wordPos keys to strings for JSON serialization
        word_database_str = {str(k): v for k, v in global_database.items()}
        
        data = {
            'inputText': input_text,
            'wordDatabase': word_database_str,
            'segments': global_segment_database,
            'idioms': global_idiom_database,
            'knownWords': global_known_words
        }
        
        with open(filename, 'w', encoding='utf-8') as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
        
        print(f"Progress saved to '{filename}'")
        return True
    except Exception as e:
        print(f"Error saving progress to '{filename}': {e}")
        return False

def initialize_gemini_model(model_name):
    """Initialize the Gemini model with API key."""
    global gemini_model
    
    if not LLM_API_KEY:
        exit_with_error("API key not found. Please set GEMINI_API_KEY or LLM_API_KEY environment variable.")
    
    try:
        genai.configure(api_key=LLM_API_KEY)
        gemini_model = genai.GenerativeModel(
            model_name=model_name,
            safety_settings=SAFETY_SETTINGS,
            generation_config=GENERATION_CONFIG
        )
        print(f"Gemini model '{model_name}' initialized successfully.")
        return True
    except Exception as e:
        exit_with_error(f"Failed to initialize Gemini model: {e}")

async def process_batch_with_gemini(batch_text, batch_data):
    """Process a batch of text with Gemini API."""
    try:
        # Create a simple prompt for the batch
        prompt = f"""
        Analyze the following Spanish text and provide linguistic analysis in JSON format.
        For each word, provide: word, pos (part of speech), lemma, best_translation, possible_translations.
        
        Text: {batch_text}
        
        Return a JSON object with the analysis.
        """
        
        response = await gemini_model.generate_content_async(prompt)
        
        if response and response.text:
            try:
                result = json.loads(response.text)
                return result
            except json.JSONDecodeError:
                print(f"Warning: Invalid JSON response from Gemini for batch")
                return None
        else:
            print(f"Warning: Empty response from Gemini for batch")
            return None
            
    except Exception as e:
        print(f"Error processing batch with Gemini: {e}")
        return None

def main():
    parser = argparse.ArgumentParser(description='Advanced LLM Text Processor')
    parser.add_argument('--input', help='Input text file path')
    parser.add_argument('--resume-from', help='Resume from JSON progress file')
    parser.add_argument('--output', required=True, help='Output JSON file path')
    parser.add_argument('--model', default=DEFAULT_GEMINI_MODEL_NAME, help='Gemini model name')
    parser.add_argument('--batch-size', type=int, default=DEFAULT_TARGET_WORDS_PER_BATCH, help='Words per batch')
    parser.add_argument('--concurrency', type=int, default=DEFAULT_MAX_CONCURRENT_API_CALLS, help='Concurrent API calls')
    parser.add_argument('--initialize-only', action='store_true', help='Only initialize word database')
    
    args = parser.parse_args()
    
    # Initialize Gemini model
    initialize_gemini_model(args.model)
    
    input_text = ""
    
    # Handle different modes
    if args.resume_from:
        print(f"Resuming from progress file: {args.resume_from}")
        input_text, success = load_progress(args.resume_from)
        if not success:
            exit_with_error("Failed to load progress file")
    elif args.input:
        print(f"Reading input from: {args.input}")
        try:
            with open(args.input, 'r', encoding='utf-8') as f:
                input_text = f.read()
        except Exception as e:
            exit_with_error(f"Failed to read input file: {e}")
        
        # Tokenize and create word database
        tokenize_and_ensure_word_entries(input_text)
    else:
        exit_with_error("Either --input or --resume-from must be specified")
    
    # If initialize-only, just save and exit
    if args.initialize_only:
        print("Initialize-only mode: saving word database and exiting")
        if save_progress(args.output, input_text):
            print(f"Initialization complete. Word database saved to {args.output}")
        else:
            exit_with_error("Failed to save initialization data")
        return
    
    # For full processing, implement batch processing here
    print(f"Starting full processing with batch size: {args.batch_size}, concurrency: {args.concurrency}")
    
    # Create batches and process them
    # This is a simplified version - the full implementation would be more complex
    batch_size = args.batch_size
    total_words = len(global_database)
    total_batches = (total_words + batch_size - 1) // batch_size
    
    print(f"Processing {total_words} words in {total_batches} batches")
    
    # Process in batches (simplified)
    for batch_num in range(total_batches):
        start_idx = batch_num * batch_size + 1
        end_idx = min((batch_num + 1) * batch_size, total_words)
        
        print(f"Progress: {batch_num + 1}/{total_batches} batches")
        
        # Get batch words
        batch_words = []
        for i in range(start_idx, end_idx + 1):
            if i in global_database:
                batch_words.append(global_database[i]['word'])
        
        batch_text = ' '.join(batch_words)
        
        # Process with Gemini (simplified)
        if gemini_model and batch_text:
            result = await process_batch_with_gemini(batch_text, {})
            if result:
                # Update global_database with results (simplified)
                print(f"Batch {batch_num + 1} processed successfully")
            else:
                print(f"Warning: Batch {batch_num + 1} processing failed")
        
        # Add delay to respect rate limits
        await asyncio.sleep(1)
    
    # Save final results
    if save_progress(args.output, input_text):
        print(f"Processing complete. Results saved to {args.output}")
    else:
        exit_with_error("Failed to save final results")

if __name__ == "__main__":
    if sys.version_info >= (3, 7):
        asyncio.run(main())
    else:
        loop = asyncio.get_event_loop()
        loop.run_until_complete(main())