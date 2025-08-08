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
from dotenv import load_dotenv
# --- Configuration ---
load_dotenv()
# !!! PASTE YOUR GEMINI API KEY HERE !!!
# It's recommended to use environment variables or a config file for API keys
# instead of hardcoding them directly in the script.
LLM_API_KEY = os.getenv("LLM_API_KEY") # Replace with your actual key

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
TOKEN_REGEX = r"([\p{L}'’]+)|(\s+)|(\n+)|([^\p{L}\s\n'’]+)" # Reverted to original regex

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
                if target_token_idx == -1 and wp >= target_pos: target_token_idx = i
                if wp <= max_pos: max_token_idx = i
                elif wp > max_pos:
                    if max_token_idx == -1: max_token_idx = i - 1 if i > 0 else 0
                    break
        if min_token_idx == -1: min_token_idx = last_split_idx + 1
        if max_token_idx == -1: max_token_idx = len(all_tokens) - 1
        if target_token_idx == -1: target_token_idx = max_token_idx
        best_split_idx, best_score = -1, -1
        search_radius = max(target_token_idx - min_token_idx, max_token_idx - target_token_idx)
        for offset in range(search_radius + 1):
            indices = []
            if target_token_idx + offset <= max_token_idx: indices.append((target_token_idx + offset, True))
            if offset > 0 and target_token_idx - offset >= min_token_idx: indices.append((target_token_idx - offset, False))
            for idx, prio in indices:
                if idx > last_split_idx:
                    token = all_tokens[idx]
                    score = -1
                    if token['type'] == 'punctuation': score = 1 if token['text'] == ',' else (2 if token['text'] in (';', ':') else 3)
                    elif token['type'] == 'newline': score = 2.5
                    if score != -1 and (best_score == -1 or score < best_score or (score == best_score and prio)):
                        best_score, best_split_idx = score, idx
        if best_split_idx == -1:
            best_split_idx = target_token_idx
            while (best_split_idx + 1 < len(all_tokens) and best_split_idx + 1 <= max_token_idx and all_tokens[best_split_idx + 1]['type'] != 'word'):
                best_split_idx += 1
        if best_split_idx <= last_split_idx:
            next_word_idx = next((i for i, t in enumerate(all_tokens[last_split_idx + 1:], start=last_split_idx + 1) if t['type'] == 'word'), -1)
            if next_word_idx != -1:
                best_split_idx = max(next_word_idx - 1, last_split_idx + 1)
                while (best_split_idx + 1 < len(all_tokens) and all_tokens[best_split_idx + 1]['type'] != 'word'): best_split_idx += 1
            else: best_split_idx = len(all_tokens) - 1
            if best_split_idx <= last_split_idx:
                print("Error: Cannot advance split point. Ending.")
                if last_split_idx < len(all_tokens) - 1: split_points.append(len(all_tokens) - 1)
                break
        print(f"   -> Chosen split point index: {best_split_idx} (Token type: '{all_tokens[best_split_idx]['type']}', text: '{all_tokens[best_split_idx]['text'].strip()}')")
        split_points.append(best_split_idx)
        last_split_idx = best_split_idx
        current_word_count = sum(1 for t in all_tokens[:last_split_idx + 1] if t['type'] == 'word')
    return split_points


def calculate_batch_boundaries(split_points):
    """Calculates batch boundaries."""
    global all_tokens
    batch_boundaries = {}
    start_token_index = 0
    print("Calculating batch boundaries...")
    for index, end_token_index in enumerate(split_points):
        batch_index = index + 1
        word_keys = set()
        start_key, end_key = None, None
        for i in range(start_token_index, end_token_index + 1):
            if i < len(all_tokens):
                token = all_tokens[i]
                if token['type'] == 'word' and token['wordPos'] is not None:
                    wp = token['wordPos']
                    word_keys.add(wp)
                    if start_key is None: start_key = wp
                    end_key = wp
            else: print(f"Warning: Token index {i} out of bounds")
        if start_key is None:
            prev_wp = 0
            if start_token_index > 0 and start_token_index - 1 < len(all_tokens):
                prev_token = all_tokens[start_token_index - 1]
                if prev_token['type'] == 'word' and prev_token['wordPos'] is not None: prev_wp = prev_token['wordPos']
            start_key = prev_wp + 1
            end_key = start_key - 1
        segment_id = f"seg-{start_key}-{end_key}"
        batch_boundaries[batch_index] = {
            'startTokenIndex': start_token_index, 'endTokenIndex': end_token_index,
            'wordKeys': word_keys, 'segmentId': segment_id,
            'batchStartWordKey': start_key, 'batchEndWordKey': end_key
        }
        print(f"  Batch {batch_index}: Tokens {start_token_index}-{end_token_index}, Words {start_key}-{end_key}, ID: '{segment_id}'")
        start_token_index = end_token_index + 1
    return batch_boundaries

def update_python_stats(current_global_database):
    """
    Calculates frequency statistics based on the most frequent lemma
    for each word+pos combination.
    """
    if not current_global_database: return {}
    print("Recalculating word statistics (using most frequent lemma)...")

    word_pos_lemma_counts = defaultdict(Counter) # Stores lemma counts for each word+pos: { "word|pos": Counter({"lemma1": 5, "lemma2": 1}) }

    # --- Pass 1: Count lemma occurrences for each word+pos pair ---
    for data in current_global_database.values():
        if data and isinstance(data, dict) and 'word' in data:
            # Use the word stored in the DB (which has original casing) for lowercase key
            word_lower = data.get('word', '').lower()
            lemma = data.get('lemma', 'TBD')
            pos = data.get('pos', 'TBD')

            # Count lemmas for word|pos pair (only if lemma and pos are not TBD)
            if lemma != "TBD" and pos != "TBD":
                word_pos_key = f"{word_lower}|{pos}"
                word_pos_lemma_counts[word_pos_key][lemma] += 1

    # --- Pass 2: Determine most frequent lemma for each word|pos pair ---
    most_frequent_lemmas = {} # { "word|pos": "most_frequent_lemma" }
    for word_pos_key, lemma_counter in word_pos_lemma_counts.items():
        if lemma_counter: # Ensure there are counts
            # Find the lemma with the highest count
            most_common_lemma, _ = lemma_counter.most_common(1)[0]
            most_frequent_lemmas[word_pos_key] = most_common_lemma

    # --- Pass 3: Assign the most frequent lemma to each entry ---
    for key in current_global_database:
        data = current_global_database[key]
        if data and isinstance(data, dict) and 'word' in data:
            word_lower = data.get('word', '').lower()
            pos = data.get('pos', 'TBD')
            word_pos_key = f"{word_lower}|{pos}"
            # Assign the calculated most frequent lemma, default to original lemma or TBD if not found
            data['most_frequent_lemma'] = most_frequent_lemmas.get(word_pos_key, data.get('lemma', "TBD"))

    # --- Pass 4: Aggregate stats based on word|most_frequent_lemma|pos ---
    group_aggregates_refined = defaultdict(lambda: {'totalFreq': 0, 'translations': set(), 'lemma_translations': set()})
    for data in current_global_database.values():
        if data and isinstance(data, dict) and 'word' in data:
            word_lower = data.get('word', '').lower()
            mfl = data.get('most_frequent_lemma', 'TBD') # Use the most frequent lemma now
            pos = data.get('pos', 'TBD')

            # Group by word|most_frequent_lemma|pos
            refined_group_key = f"{word_lower}|{mfl or 'null'}|{pos or 'null'}"
            agg = group_aggregates_refined[refined_group_key]
            agg['totalFreq'] += 1

            pt = data.get('possible_translations')
            lt = data.get('lemma_translations')
            if isinstance(pt, list): agg['translations'].update(pt)
            elif isinstance(pt, str) and pt: agg['translations'].update(t.strip() for t in pt.split(','))
            if isinstance(lt, list): agg['lemma_translations'].update(lt)
            elif isinstance(lt, str) and lt: agg['lemma_translations'].update(t.strip() for t in lt.split(','))


    # --- Pass 5: Update global_database with refined stats ---
    seen_groups_refined = set()
    running_counts_refined = defaultdict(int)
    sorted_keys = sorted(current_global_database.keys())

    for key in sorted_keys:
        data = current_global_database[key]
        if data and isinstance(data, dict) and 'word' in data:
            word_lower = data.get('word', '').lower()
            mfl = data.get('most_frequent_lemma', 'TBD')
            pos = data.get('pos', 'TBD')

            # Use the refined key for stats lookup and calculation
            refined_group_key = f"{word_lower}|{mfl or 'null'}|{pos or 'null'}"
            agg = group_aggregates_refined.get(refined_group_key)

            data['first_inst'] = refined_group_key not in seen_groups_refined
            if data['first_inst']: seen_groups_refined.add(refined_group_key)

            running_counts_refined[refined_group_key] += 1
            data['freq_till_now'] = running_counts_refined[refined_group_key]

            if agg:
                data['freq'] = agg['totalFreq']
                # Assign aggregated translations based on the refined group
                data['possible_translations'] = sorted(list(agg['translations']))
                data['lemma_translations'] = sorted(list(agg['lemma_translations']))
            else:
                # Should not happen if entry exists, but fallback
                data['freq'], data['possible_translations'], data['lemma_translations'] = 0, [], []

    print(f"Statistics recalculated for {len(current_global_database)} word entries (grouped by most frequent lemma).")
    return current_global_database # Return the modified database


def format_llm_prompt(batch_text, batch_data_json_str):
    """Formats the LLM prompt using the loaded template."""
    global loaded_prompt_template
    if not loaded_prompt_template: raise ValueError("Prompt template not loaded.")
    prompt = loaded_prompt_template.replace("{BATCH_TEXT_HERE}", batch_text)
    prompt = prompt.replace("{COMBINED_JSON_HERE}", batch_data_json_str)
    return prompt

async def call_llm_api_async(prompt, batch_index, semaphore):
    """
    Asynchronously calls the configured Gemini API, respecting the semaphore.
    Includes basic retry logic for API call errors.
    """
    global gemini_model, SAFETY_SETTINGS, GENERATION_CONFIG
    if not gemini_model:
        raise RuntimeError("Gemini model not initialized. Check API key configuration.")

    # Acquire semaphore before making the API call
    async with semaphore:
        print(f"--- Calling Gemini API for Batch/Range {batch_index} (Semaphore acquired) ---") # Modified log
        print(f"  Prompt length: {len(prompt)} characters")
        # Use MAX_API_RETRIES for API call failures
        for attempt in range(MAX_API_RETRIES):
            response = None
            response_text = None
            try:
                print(f"  Attempt {attempt + 1}: Sending async request to Gemini for {batch_index}...")
                # Use the async version of generate_content
                response = await gemini_model.generate_content_async(
                    prompt,
                    generation_config=GENERATION_CONFIG,
                    safety_settings=SAFETY_SETTINGS
                )
                print(f"  Attempt {attempt + 1}: Received async response from Gemini for {batch_index}.")

                try:
                    response_text = response.text
                    print(f"--- API Call Successful (Attempt {attempt + 1}) for {batch_index} ---")
                    # Semaphore is released automatically when 'async with' block exits
                    return response_text
                except ValueError:
                    print(f"Warning: Gemini response for {batch_index} was likely blocked or empty (ValueError accessing .text).")
                    if hasattr(response, 'prompt_feedback'):
                        print(f"Prompt Feedback: {response.prompt_feedback}")
                    else:
                        print("Prompt Feedback: Not available in response object.")
                    # Semaphore is released automatically when 'async with' block exits
                    return json.dumps({"wordData": {}, "segmentData": {}, "idioms": []}) # Return empty structure

            except Exception as e:
                print(f"--- API Call FAILED (Attempt {attempt + 1}/{MAX_API_RETRIES}) for {batch_index}: {e} ---")
                error_str = str(e).lower()
                if "rate limit" in error_str or "resource exhausted" in error_str or "429" in error_str or "500" in error_str or "503" in error_str:
                    if attempt < MAX_API_RETRIES - 1:
                        # Use API_RETRY_DELAY_SECONDS for rate limits etc.
                        wait_time = API_RETRY_DELAY_SECONDS * (2 ** attempt) # Exponential backoff
                        print(f"Retryable API error detected for {batch_index}. Retrying in {wait_time} seconds...")
                        await asyncio.sleep(wait_time) # Use asyncio.sleep
                    else:
                        print(f"Max retries reached for API error for {batch_index}.")
                        # Semaphore is released automatically when 'async with' block exits due to raise
                        raise # Re-raise the last exception
                else:
                    print(f"Non-retryable API error detected for {batch_index}.")
                    # Semaphore is released automatically when 'async with' block exits due to raise
                    raise
        # If loop finishes without returning/raising (shouldn't happen with current logic)
        print(f"--- Exiting call_llm_api_async for {batch_index} unexpectedly ---")
        # Semaphore is released automatically when 'async with' block exits
        return None


def validate_llm_response(response_text):
    """Validates the LLM JSON response."""
    # This function remains synchronous as it processes the returned text
    if not response_text:
        print("Validation Error: Received empty response text.")
        return None
    try:
        parsed_json = json.loads(response_text)
        if not isinstance(parsed_json, dict):
            print("Validation Error: LLM response is not a JSON object.")
            return None
        if not all(k in parsed_json for k in ['wordData', 'segmentData', 'idioms']):
            print("Validation Error: LLM response missing required keys ('wordData', 'segmentData', 'idioms').")
            return None
        if not isinstance(parsed_json.get('wordData'), dict):
             print("Validation Error: 'wordData' is not an object.")
             return None
        if not isinstance(parsed_json.get('segmentData'), dict):
             print("Validation Error: 'segmentData' is not an object.")
             return None
        if not isinstance(parsed_json.get('idioms'), list):
             print("Validation Error: 'idioms' is not a list.")
             return None
        print("LLM response validated successfully.")
        return parsed_json
    except json.JSONDecodeError as e:
        print(f"Validation Error: LLM response is not valid JSON. Error: {e}")
        print("--- Received Text Start (first 500 chars) ---")
        print(response_text[:500])
        print("--- Received Text End ---")
        return None
    except Exception as e:
        print(f"Validation Error: Unexpected validation error: {e}")
        return None


async def integrate_llm_data_async(llm_data, lock):
    """
    Asynchronously integrates validated LLM data into global state using a lock.
    (Used for normal batch processing)
    """
    # Access global variables directly (no need for 'global' keyword inside async func if modifying mutable objects)
    updated_words, updated_segments, added_segments, updated_idioms, added_idioms = 0, 0, 0, 0, 0

    async with lock: # Acquire lock before modifying shared data
        # print(f"DEBUG: Lock acquired for integration by task.") # Less verbose
        # Integrate Word Data
        batch_word_data = llm_data.get('wordData', {})
        if isinstance(batch_word_data, dict):
            llm_keys = sorted([int(k) for k in batch_word_data.keys() if k.isdigit()])
            # print(f"DEBUG: Integrating LLM response with {len(llm_keys)} word entries. Keys sample: {llm_keys[:5]}...{llm_keys[-5:]}" if len(llm_keys) > 10 else f"DEBUG: Integrating LLM response keys: {llm_keys}")
            for word_pos_str, word_data in batch_word_data.items():
                try:
                    word_pos = int(word_pos_str)
                    if word_pos in global_database and isinstance(word_data, dict) and 'word' in word_data:
                        # Ensure most_frequent_lemma field exists before updating
                        if 'most_frequent_lemma' not in global_database[word_pos]:
                             global_database[word_pos]['most_frequent_lemma'] = "TBD"
                        # Preserve original word casing from initial tokenization
                        original_word = global_database[word_pos].get('word', word_data.get('word',''))
                        global_database[word_pos].update(word_data)
                        global_database[word_pos]['word'] = original_word # Restore original casing
                        updated_words += 1
                except ValueError: print(f"Warning: Invalid word key '{word_pos_str}' from LLM.")

        # Integrate Segment Data
        batch_segment_data = llm_data.get('segmentData', {})
        if isinstance(batch_segment_data, dict):
            for seg_id, seg_entry in batch_segment_data.items():
                if isinstance(seg_entry, dict) and all(k in seg_entry for k in ['id', 'translations', 'startWordKey', 'endWordKey']):
                    found_idx = next((i for i, s in enumerate(global_segment_database) if s.get('id') == seg_id), -1)
                    if found_idx != -1:
                        if isinstance(seg_entry.get('translations'), dict):
                            global_segment_database[found_idx].update(seg_entry)
                            updated_segments += 1
                    else:
                        global_segment_database.append(seg_entry)
                        added_segments += 1

        # Integrate Idiom Data
        batch_idioms = llm_data.get('idioms', [])
        if isinstance(batch_idioms, list):
            for idiom in batch_idioms:
                if isinstance(idiom, dict) and all(k in idiom for k in ['id', 'text', 'startWordKey', 'endWordKey']):
                    idiom_id = idiom['id']
                    found_idx = next((i for i, idi in enumerate(global_idiom_database) if idi.get('id') == idiom_id), -1)
                    if found_idx != -1:
                        global_idiom_database[found_idx].update(idiom)
                        updated_idioms += 1
                    else:
                        global_idiom_database.append(idiom)
                        added_idioms += 1

        # print(f"DEBUG: Lock released after integration by task.") # Less verbose
    # Lock is automatically released when exiting 'async with' block

    print(f"Integration complete: {updated_words} words, {updated_segments+added_segments} segments, {updated_idioms+added_idioms} idioms.")

# --- NEW FUNCTION ---
def is_batch_processed(batch_word_keys):
    """
    Checks if all words in a batch have been processed (basic check).
    Returns True if processed, False otherwise.
    """
    if not batch_word_keys:
        return True # Empty batch is considered processed

    for key in batch_word_keys:
        word_entry = global_database.get(key)
        # Define "processed" as having non-TBD POS and non-TBD best_translation
        # Add more checks if needed (e.g., lemma)
        if not word_entry or word_entry.get('pos') == "TBD" or word_entry.get('best_translation') == "TBD":
            return False # Found an unprocessed entry
    return True # All entries seem processed

async def process_batch_parallel(batch_index, batch_info, lock, semaphore):
    """
    Processes a single batch asynchronously: prepare, call API (with semaphore), validate, integrate (with lock).
    Includes checks for already processed batches and max batch limit.
    """
    global args # Access command line arguments

    # --- Skip checks are now handled before calling this function ---

    print(f"\n--- Starting Task for Batch {batch_index}/{total_batches} (Segment: {batch_info['segmentId']}) ---")
    batch_text = "".join(t['text'] for t in all_tokens[batch_info['startTokenIndex']:batch_info['endTokenIndex'] + 1])
    print(f"  Batch Text Start: '{batch_text[:70].replace(chr(10), ' ')}...'")

    # Prepare data for the prompt (read-only access to global_database here)
    # Ensure keys are sorted numerically before creating the prompt data for consistency
    sorted_word_keys = sorted(list(batch_info['wordKeys']))
    batch_word_data_for_prompt = {str(k): global_database[k] for k in sorted_word_keys if k in global_database}

    # Read-only access to segment/idiom DBs
    segment_data = next((s for s in global_segment_database if s.get('id') == batch_info['segmentId']),
                         {'id': batch_info['segmentId'], 'startWordKey': batch_info['batchStartWordKey'], 'endWordKey': batch_info['batchEndWordKey'], 'translations': {}})
    relevant_idioms = [idiom for idiom in global_idiom_database if
                       idiom.get('startWordKey', -1) >= batch_info['batchStartWordKey'] and
                       idiom.get('endWordKey', -1) <= batch_info['batchEndWordKey']]
    combined_data = {"wordData": batch_word_data_for_prompt, "segmentData": {batch_info['segmentId']: segment_data}, "idioms": relevant_idioms}

    try: combined_json_str = json.dumps(combined_data, indent=2)
    except Exception as e:
        print(f"ERROR: Failed to create JSON for prompt {batch_index}: {e}")
        return batch_index, "JSON_creation_error", None, None # Return error status and None for data/response

    prompt = format_llm_prompt(batch_text.strip(), combined_json_str) # Use the standard template

    # --- Validation Retry Loop ---
    validated_data = None
    llm_response_text = None # Store the last response text for logging
    for validation_attempt in range(MAX_VALIDATION_RETRIES):
        print(f"  Attempt {validation_attempt + 1}/{MAX_VALIDATION_RETRIES} for batch {batch_index}...")
        try:
            # Call the ASYNC API function, passing the semaphore
            llm_response_text = await call_llm_api_async(prompt, batch_index, semaphore) # Removed pass_num
            # Validate the response
            validated_data = validate_llm_response(llm_response_text)

            if validated_data:
                print(f"  Validation successful for batch {batch_index} on attempt {validation_attempt + 1}.")
                break # Exit retry loop if validation succeeds
            else:
                print(f"  Validation failed for batch {batch_index} on attempt {validation_attempt + 1}.")
                if validation_attempt < MAX_VALIDATION_RETRIES - 1:
                    print(f"  Waiting {RETRY_DELAY_SECONDS}s before retrying API call...")
                    await asyncio.sleep(RETRY_DELAY_SECONDS) # Use async sleep
                else:
                    print(f"ERROR: Batch {batch_index} failed validation after {MAX_VALIDATION_RETRIES} attempts. Skipping integration.")
                    # Return failure status, the input JSON, and the last failed response
                    return batch_index, "validation_failed", combined_json_str, llm_response_text

        except Exception as api_error:
            print(f"ERROR: Unrecoverable API error during attempt {validation_attempt + 1} for batch {batch_index}: {api_error}")
            validated_data = None
            # Return failure status, the input JSON, and the error
            return batch_index, f"API_error: {api_error}", combined_json_str, None

    # --- Integration (only if validation succeeded) ---
    if validated_data:
        try:
            # Call the ASYNC integration function with the lock
            await integrate_llm_data_async(validated_data, lock) # Removed pass_num
            return batch_index, "success", None, None # Return success status
        except Exception as integration_error:
             print(f"ERROR: Failed to integrate data for batch {batch_index} after successful validation: {integration_error}")
             # Return failure status, the input JSON, and the successful response (as integration failed)
             return batch_index, f"integration_error: {integration_error}", combined_json_str, llm_response_text
    else:
        # This case is handled if validation fails after retries
        return batch_index, "validation_failed", combined_json_str, llm_response_text


# --- NEW FUNCTION for Reprocessing a Range ---
async def reprocess_word_range(start_word, end_word, lock, semaphore):
    """
    Reprocesses a specific range of words (optionally adding context).
    Updates words, idioms, and adds/updates a segment for the specific range.
    """
    global all_tokens, global_database, global_idiom_database, global_segment_database, args

    print(f"\n--- Starting Reprocessing Task for Words {start_word}-{end_word} ---")

    # --- Determine Context Window ---
    context_start_word = start_word
    context_end_word = end_word
    original_range_size = end_word - start_word + 1

    if original_range_size < MIN_RANGE_FOR_CONTEXT:
        print(f"Range size ({original_range_size}) is less than {MIN_RANGE_FOR_CONTEXT}. Expanding context...")
        # Calculate context boundaries, ensuring they don't go out of bounds
        context_start_word = max(1, start_word - CONTEXT_WORD_WINDOW)
        context_end_word = min(global_word_counter, end_word + CONTEXT_WORD_WINDOW)
        print(f"  Expanded context window to words: {context_start_word}-{context_end_word}")
    else:
        print(f"  Using original range for context: {start_word}-{end_word}")

    # --- Find Token Indices for Context Window ---
    context_start_token_idx = -1
    context_end_token_idx = -1
    context_word_keys = []

    for i, token in enumerate(all_tokens):
        if token['type'] == 'word':
            wp = token['wordPos']
            if wp >= context_start_word and context_start_token_idx == -1:
                context_start_token_idx = i
            if wp <= context_end_word:
                context_end_token_idx = i
                if wp >= context_start_word: # Only add keys within the context window
                    context_word_keys.append(wp)
            elif wp > context_end_word:
                 break # Past the end of the context window

    if context_start_token_idx == -1 or context_end_token_idx == -1:
        print(f"ERROR: Could not find token indices for context window {context_start_word}-{context_end_word}.")
        return "context_token_error", None, None

    # --- Extract Text and Data for Context Window ---
    context_text = "".join(t['text'] for t in all_tokens[context_start_token_idx:context_end_token_idx + 1])
    # Use sorted keys for preparing prompt data
    sorted_context_keys = sorted(context_word_keys)
    # Get potentially existing data from global_database for the context window
    context_word_data_for_prompt = {str(k): global_database.get(k, {}) for k in sorted_context_keys}

    print(f"DEBUG: Preparing prompt for reprocessing range {start_word}-{end_word} (using context {context_start_word}-{context_end_word})")
    print(f"  Context includes {len(sorted_context_keys)} words.")

    # Create the segment structure for the *original* requested range
    custom_segment_id = f"seg-{start_word}-{end_word}"
    segment_data_for_prompt = {
        custom_segment_id: {
            "id": custom_segment_id,
            "startWordKey": start_word,
            "endWordKey": end_word,
            "translations": {} # Ask LLM to fill this
        }
    }

    # Include word data for the context window, segment data for the target range, empty idioms
    combined_data = {"wordData": context_word_data_for_prompt, "segmentData": segment_data_for_prompt, "idioms": []}

    try: combined_json_str = json.dumps(combined_data, indent=2)
    except Exception as e:
        print(f"ERROR: Failed to create JSON for reprocessing range {start_word}-{end_word}: {e}")
        return "JSON_creation_error", None, None

    prompt = format_llm_prompt(context_text.strip(), combined_json_str)

    # --- API Call + Validation Loop ---
    validated_data = None
    llm_response_text = None
    for validation_attempt in range(MAX_VALIDATION_RETRIES):
        print(f"  Attempt {validation_attempt + 1}/{MAX_VALIDATION_RETRIES} for reprocessing range {start_word}-{end_word}...")
        try:
            llm_response_text = await call_llm_api_async(prompt, f"Range {start_word}-{end_word}", semaphore)
            validated_data = validate_llm_response(llm_response_text)
            if validated_data:
                print(f"  Validation successful for range {start_word}-{end_word} on attempt {validation_attempt + 1}.")
                break
            else:
                print(f"  Validation failed for range {start_word}-{end_word} on attempt {validation_attempt + 1}.")
                if validation_attempt < MAX_VALIDATION_RETRIES - 1:
                    print(f"  Waiting {RETRY_DELAY_SECONDS}s before retrying API call...")
                    await asyncio.sleep(RETRY_DELAY_SECONDS)
                else:
                    print(f"ERROR: Range {start_word}-{end_word} failed validation after {MAX_VALIDATION_RETRIES} attempts.")
                    return "validation_failed", combined_json_str, llm_response_text
        except Exception as api_error:
            print(f"ERROR: Unrecoverable API error during attempt {validation_attempt + 1} for range {start_word}-{end_word}: {api_error}")
            return f"API_error: {api_error}", combined_json_str, None

    # --- Targeted Integration ---
    if validated_data:
        updated_word_count = 0
        added_idioms_count = 0
        removed_idioms_count = 0
        segment_updated = False
        try:
            async with lock:
                print(f"DEBUG: Lock acquired for integrating reprocessed range {start_word}-{end_word}.")
                response_word_data = validated_data.get('wordData', {})
                response_segment_data = validated_data.get('segmentData', {})
                response_idioms = validated_data.get('idioms', [])

                # 1. Update wordData only for the originally requested range
                for word_pos_str, word_data in response_word_data.items():
                    try:
                        word_pos = int(word_pos_str)
                        # Check if this word was in the *original* requested range
                        if start_word <= word_pos <= end_word:
                            if word_pos in global_database and isinstance(word_data, dict) and 'word' in word_data:
                                print(f"  Updating word {word_pos}...")
                                # Ensure most_frequent_lemma field exists before updating
                                if 'most_frequent_lemma' not in global_database[word_pos]:
                                     global_database[word_pos]['most_frequent_lemma'] = "TBD"
                                # Preserve original word casing from initial tokenization
                                original_word = global_database[word_pos].get('word', word_data.get('word',''))
                                global_database[word_pos].update(word_data)
                                global_database[word_pos]['word'] = original_word # Restore original casing
                                updated_word_count += 1
                    except ValueError:
                        print(f"Warning: Invalid word key '{word_pos_str}' in reprocess response.")

                # 2. Update/Add the custom segment translation
                custom_segment_response = response_segment_data.get(custom_segment_id)
                if custom_segment_response and isinstance(custom_segment_response.get('translations'), dict):
                    found_idx = next((i for i, s in enumerate(global_segment_database) if s.get('id') == custom_segment_id), -1)
                    if found_idx != -1:
                        print(f"  Updating existing custom segment {custom_segment_id}...")
                        # Ensure essential keys are preserved if not in response
                        custom_segment_response['id'] = custom_segment_id
                        custom_segment_response['startWordKey'] = start_word
                        custom_segment_response['endWordKey'] = end_word
                        global_segment_database[found_idx].update(custom_segment_response)
                        segment_updated = True
                    else:
                        print(f"  Adding new custom segment {custom_segment_id}...")
                        # Ensure essential keys are present
                        custom_segment_response['id'] = custom_segment_id
                        custom_segment_response['startWordKey'] = start_word
                        custom_segment_response['endWordKey'] = end_word
                        global_segment_database.append(custom_segment_response)
                        segment_updated = True
                else:
                    print(f"Warning: No valid segment data found in response for {custom_segment_id}")


                # 3. Replace idioms *within the original requested range*
                # Remove existing idioms fully contained within the original range
                initial_idiom_count = len(global_idiom_database)
                global_idiom_database[:] = [idiom for idiom in global_idiom_database if not (
                    idiom.get('startWordKey', -1) >= start_word and idiom.get('endWordKey', -1) <= end_word
                )]
                removed_idioms_count = initial_idiom_count - len(global_idiom_database)
                if removed_idioms_count > 0: print(f"  Removed {removed_idioms_count} existing idioms within range {start_word}-{end_word}.")

                # Add new idioms from the response if they fall within the original range
                new_idioms_in_range = []
                for idiom in response_idioms:
                     if isinstance(idiom, dict) and all(k in idiom for k in ['id', 'text', 'startWordKey', 'endWordKey']):
                         # Check if the idiom from the response falls within the *original* range
                         if idiom.get('startWordKey', -1) >= start_word and idiom.get('endWordKey', -1) <= end_word:
                             new_idioms_in_range.append(idiom)
                             added_idioms_count += 1
                if new_idioms_in_range:
                     global_idiom_database.extend(new_idioms_in_range)
                     print(f"  Added {added_idioms_count} new idioms for range {start_word}-{end_word}.")

                print(f"DEBUG: Lock released after integrating reprocessed range {start_word}-{end_word}.")

            print(f"Integration complete for range {start_word}-{end_word}: Updated {updated_word_count} words, Segment Updated: {segment_updated}, Replaced/Added {added_idioms_count} idioms.")
            return "success", None, None
        except Exception as integration_error:
             print(f"ERROR: Failed to integrate data for reprocessed range {start_word}-{end_word}: {integration_error}")
             return f"integration_error: {integration_error}", combined_json_str, llm_response_text
    else:
        return "validation_failed", combined_json_str, llm_response_text

# --- NEW FUNCTION for Clearing Data ---
def clear_data(target_word_keys, target_segment_id=None):
    """
    Resets specified word entries and related segment/idioms to placeholders.
    """
    global global_database, global_segment_database, global_idiom_database
    words_cleared = 0
    segment_cleared = False
    idioms_removed = 0

    # Reset Word Data
    for key in target_word_keys:
        if key in global_database:
            print(f"  Clearing word {key}...")
            # Preserve original word, freq, freq_till_now, first_inst
            original_word = global_database[key].get('word', 'unknown')
            # Reset analysis fields, keep existing stats
            global_database[key]['pos'] = "TBD"
            global_database[key]['lemma'] = "TBD"
            global_database[key]['best_translation'] = "TBD"
            global_database[key]['possible_translations'] = []
            global_database[key]['details'] = {}
            global_database[key]['lemma_translations'] = []
            global_database[key]['most_frequent_lemma'] = "TBD" # Reset new field
            words_cleared += 1

    # Reset Segment Translations (only if clearing a full batch)
    if target_segment_id:
        seg_idx = next((i for i, s in enumerate(global_segment_database) if s.get('id') == target_segment_id), -1)
        if seg_idx != -1:
            print(f"  Clearing translations for segment {target_segment_id}...")
            global_segment_database[seg_idx]['translations'] = {}
            segment_cleared = True
        # Also remove custom segments that might fully overlap this batch range
        min_key = min(target_word_keys)
        max_key = max(target_word_keys)
        initial_seg_count = len(global_segment_database)
        global_segment_database[:] = [seg for seg in global_segment_database if not (
            seg.get('startWordKey') == min_key and seg.get('endWordKey') == max_key and seg.get('id') != target_segment_id
        )]
        if len(global_segment_database) < initial_seg_count:
             print(f"  Removed custom segments overlapping exactly with batch {target_segment_id}.")


    # Remove Idioms within the range
    if target_word_keys:
        min_key = min(target_word_keys)
        max_key = max(target_word_keys)
        initial_idiom_count = len(global_idiom_database)
        global_idiom_database[:] = [idiom for idiom in global_idiom_database if not (
            idiom.get('startWordKey', -1) >= min_key and idiom.get('endWordKey', -1) <= max_key
        )]
        idioms_removed = initial_idiom_count - len(global_idiom_database)
        if idioms_removed > 0: print(f"  Removed {idioms_removed} idioms within range {min_key}-{max_key}.")

    print(f"Clear operation complete: {words_cleared} words reset.")
    if segment_cleared: print("  Segment translations cleared.")
    if idioms_removed > 0: print(f"  {idioms_removed} idioms removed.")


# --- Main Function (Handles different modes) ---
async def main_processing_logic():
    """Determines the mode (fresh, resume, check, reprocess, clear) and executes."""
    global global_database, global_segment_database, global_idiom_database, all_tokens, global_word_counter, total_batches, global_known_words
    global args # Access command line arguments

    text_to_use = None
    output_file_path = args.output # Use the determined output path
    is_resuming_run = False

    # --- Mode Determination ---
    run_mode = "fresh" # Default
    if args.initialize_only: run_mode = "initialize"
    elif args.check_status_only: run_mode = "check_status"
    elif args.reprocess_range: run_mode = "reprocess_range"
    elif args.clear_batch: run_mode = "clear_batch"
    elif args.clear_range: run_mode = "clear_range"
    elif args.resume_from: run_mode = "resume_batches"

    print(f"--- Running in Mode: {run_mode} ---")

    # --- Load Data or Initialize ---
    if run_mode != "fresh" and run_mode != "initialize":
        # All modes except fresh/initialize require a resume file
        # The resume_from path is likely already set to COMBINED_DATA_FILE_PATH by argument handling
        print(f"Attempting to load data from: {args.resume_from}")
        loaded_text, load_success = load_progress(args.resume_from)
        if not load_success:
            exit_with_error(f"Could not load or parse file '{args.resume_from}'. Cannot proceed.")
        text_to_use = loaded_text
        is_resuming_run = True
        tokenize_text_only(text_to_use) # Just tokenize for splitting/boundary checks
    else: # Fresh or Initialize
        if not os.path.exists(args.input): exit_with_error(f"Input file '{args.input}' not found.")
        try:
            with open(args.input, 'r', encoding='utf-8') as f: text_to_use = f.read()
        except Exception as e: exit_with_error(f"Error reading input file '{args.input}': {e}")

        if run_mode == "initialize":
             print(f"Initializing data structure from: {args.input}")
        else: # Fresh run
             print(f"Starting fresh processing from: {args.input}")

        global_database, global_segment_database, global_idiom_database, all_tokens, global_word_counter, global_known_words = {}, [], [], [], 0, [] # Reset state including known_words
        tokenize_and_ensure_word_entries(text_to_use)
        global_database = update_python_stats(global_database) # Calculate initial stats

    # --- Exit if no text ---
    if not text_to_use:
        print("No text available to process. Exiting.")
        return

    # --- Calculate Boundaries (needed for all modes except fresh/initialize error) ---
    if not all_tokens: tokenize_text_only(text_to_use) # Ensure tokens exist if loaded
    if not all_tokens or global_word_counter == 0:
        print("No words found after tokenization. Exiting.")
        return
    split_points = find_split_points(args.batch_size, DEFAULT_BACKWARD_SEARCH_RANGE, DEFAULT_FORWARD_SEARCH_RANGE) # Use constants for range
    if not split_points: print("Could not determine split points."); return
    boundaries = calculate_batch_boundaries(split_points)
    if not boundaries: print("Could not calculate boundaries."); return
    total_batches = len(boundaries)

    # --- Execute Based on Mode ---

    # Initialize Only Mode: Skip processing, go straight to save
    if run_mode == "initialize":
        print("\n--- Initialize Only Mode ---")
        print("Skipping API processing. Saving initial placeholder data.")
        # Stats were already calculated during initialization
        # Proceed directly to final save

    elif run_mode == "check_status":
        all_batch_indices = list(boundaries.keys())
        unprocessed_batch_indices = []
        processed_count = 0
        print("\n--- Identifying batch status ---")
        status_list_output = []
        for idx in all_batch_indices:
            b_info = boundaries[idx]
            is_processed = is_batch_processed(b_info['wordKeys'])
            if is_processed:
                processed_count += 1
                status_list_output.append(f"  - Batch {idx:>3} (Words: {b_info['batchStartWordKey']:>4}-{b_info['batchEndWordKey']:<4}): Processed")
            else:
                unprocessed_batch_indices.append(idx)
                status_list_output.append(f"  X Batch {idx:>3} (Words: {b_info['batchStartWordKey']:>4}-{b_info['batchEndWordKey']:<4}): Unprocessed")
        print("\n--- Check Status Only Mode ---")
        print(f"Total Batches Found: {len(all_batch_indices)}")
        print("\nBatch Status List:")
        for line in status_list_output: print(line)
        print(f"\nSummary: {processed_count} Processed, {len(unprocessed_batch_indices)} Unprocessed")
        print("Exiting without processing.")
        return # Exit

    elif run_mode == "clear_batch":
        target_batch_index = args.clear_batch
        if target_batch_index not in boundaries:
            exit_with_error(f"Batch number {target_batch_index} does not exist (Max batch: {total_batches}).")
        print(f"\n--- Clearing data for Batch {target_batch_index} ---")
        batch_info = boundaries[target_batch_index]
        clear_data(batch_info['wordKeys'], batch_info['segmentId'])
        # Proceed to stats and save

    elif run_mode == "clear_range":
        try:
            start_str, end_str = args.clear_range.split('-')
            start_word = int(start_str)
            end_word = int(end_str)
            if start_word <= 0 or end_word < start_word or end_word > global_word_counter:
                raise ValueError("Invalid word range.")
        except Exception as e:
            exit_with_error(f"Invalid format or range for --clear-range: {args.clear_range}. Use START-END (e.g., 42-55). Error: {e}")
        print(f"\n--- Clearing data for Word Range {start_word}-{end_word} ---")
        target_keys = {k for k in range(start_word, end_word + 1)}
        clear_data(target_keys) # Don't clear segment data for arbitrary range
        # Proceed to stats and save

    elif run_mode == "reprocess_range":
        try:
            start_str, end_str = args.reprocess_range.split('-')
            start_word = int(start_str)
            end_word = int(end_str)
            if start_word <= 0 or end_word < start_word or end_word > global_word_counter:
                raise ValueError("Invalid word range.")
        except Exception as e:
            exit_with_error(f"Invalid format or range for --reprocess-range: {args.reprocess_range}. Use START-END (e.g., 42-55). Error: {e}")

        integration_lock = asyncio.Lock()
        api_semaphore = asyncio.Semaphore(args.concurrency) # Still use semaphore for the single call
        task = asyncio.create_task(reprocess_word_range(start_word, end_word, integration_lock, api_semaphore))
        results = await asyncio.gather(task, return_exceptions=True)
        # Log failure if needed (similar logic to batch processing)
        result = results[0]
        if isinstance(result, Exception):
             print(f"ERROR: Reprocessing task failed with an unexpected exception: {result}")
             # Log exception details to file?
        elif isinstance(result, tuple) and result[0] != "success":
             status, input_json_str, response_text = result
             print(f"ERROR: Reprocessing range {start_word}-{end_word} failed with status: {status}")
             # Log details to file?
             # Consider adding to failed_batches_details structure if needed elsewhere
        # Proceed to stats and save

    elif run_mode in ["fresh", "resume_batches"]:
        # Identify unprocessed batches
        all_batch_indices = list(boundaries.keys())
        unprocessed_batch_indices = []
        processed_count = 0
        for idx in all_batch_indices:
            if not is_batch_processed(boundaries[idx]['wordKeys']):
                unprocessed_batch_indices.append(idx)
            else:
                processed_count += 1
        print(f"\nFound {processed_count} already processed batches and {len(unprocessed_batch_indices)} unprocessed batches.")

        if not unprocessed_batch_indices:
            print("No unprocessed batches to run.")
        else:
            # Apply --up-to-batch limit
            batches_to_run_indices = unprocessed_batch_indices
            if args.up_to_batch is not None and args.up_to_batch > 0:
                batches_to_run_indices = [idx for idx in unprocessed_batch_indices if idx <= args.up_to_batch]
                print(f"\nLimiting processing to unprocessed batches up to number {args.up_to_batch}. Batches to run: {sorted(batches_to_run_indices)}")
            elif args.process_batches: # Check for specific batches
                 try:
                      target_batches = {int(b.strip()) for b in args.process_batches.split(',')}
                      # Filter the unprocessed list to only include the target batches
                      batches_to_run_indices = [idx for idx in unprocessed_batch_indices if idx in target_batches]
                      if not batches_to_run_indices:
                           print(f"\nNone of the specified batches ({args.process_batches}) need processing.")
                      else:
                           print(f"\nProcessing specific unprocessed batches: {sorted(batches_to_run_indices)}")
                 except ValueError:
                      exit_with_error(f"Invalid format for --process-batches. Use comma-separated numbers (e.g., '3,7,12').")
            else:
                print(f"\nProcessing all {len(batches_to_run_indices)} unprocessed batches: {sorted(batches_to_run_indices)}")

            # Process Filtered Batches in Parallel
            integration_lock = asyncio.Lock()
            api_semaphore = asyncio.Semaphore(args.concurrency)
            tasks = []
            if not batches_to_run_indices:
                 print("--- No batches selected to run based on filters. ---")
            else:
                print(f"\n--- Creating {len(batches_to_run_indices)} parallel tasks (Max concurrency: {args.concurrency}) ---")
                for batch_index in batches_to_run_indices:
                    batch_info = boundaries[batch_index]
                    task = asyncio.create_task(process_batch_parallel(batch_index, batch_info, integration_lock, api_semaphore))
                    tasks.append(task)

                if tasks:
                    print(f"--- Running {len(tasks)} selected tasks concurrently ---")
                    results = await asyncio.gather(*tasks, return_exceptions=True)
                    print("--- All selected parallel tasks completed ---")
                else:
                    print("--- No tasks were run ---")
                    results = []

                # Process results and log failures
                failed_batches_details = []
                for result in results:
                    if isinstance(result, Exception):
                        print(f"ERROR: A task failed with an unexpected exception: {result}")
                        failed_batches_details.append({'batch_index': 'Unknown', 'status': f"Task Exception: {result}", 'input_json': None, 'response_text': None})
                    elif isinstance(result, tuple):
                         if result[1] not in ["success", "skipped_max_batches", "skipped_processed"]:
                              batch_idx, status, input_json_str, response_text = result
                              print(f"ERROR: Batch {batch_idx} failed processing with status: {status}")
                              failed_batches_details.append({'batch_index': batch_idx, 'status': status, 'input_json': input_json_str, 'response_text': response_text})

                # Log detailed failures
                if failed_batches_details:
                    print(f"\n--- Summary of Failed Batches ({len(failed_batches_details)}) ---")
                    try:
                        log_mode = 'a' if os.path.exists(args.log_file) else 'w'
                        with open(args.log_file, log_mode, encoding='utf-8') as f:
                             if log_mode == 'w': f.write(f"Failed Batches Log - {time.strftime('%Y-%m-%d %H:%M:%S')}\n")
                             else: f.write(f"\n--- Appending failures from run at {time.strftime('%Y-%m-%d %H:%M:%S')} ---\n")
                             f.write("="*30 + "\n")
                             for failure in failed_batches_details:
                                 f.write(f"Batch Index: {failure['batch_index']}\n"); f.write(f"Status: {failure['status']}\n"); f.write("-" * 20 + "\n")
                                 f.write("Input JSON Sent (approx for last failed step):\n")
                                 try:
                                     parsed_input = json.loads(failure['input_json']) if failure['input_json'] else None
                                     f.write(json.dumps(parsed_input, indent=2, ensure_ascii=False) if parsed_input else "N/A\n")
                                 except: f.write(str(failure['input_json']) + "\n")
                                 f.write("-" * 20 + "\n"); f.write("Last Received Response Text (if available):\n"); f.write(str(failure['response_text']) + "\n"); f.write("="*30 + "\n\n")
                             print(f"Detailed failure information logged to '{args.log_file}'")
                    except Exception as log_e: print(f"Error writing failed batches log: {log_e}")

    # --- Final Steps (Common to all processing modes except check_status) ---
    # Recalculate stats on the potentially modified database
    global_database = update_python_stats(global_database) # Changed function name

    # Save the final state
    print("\n--- Preparing Final Output ---")
    final_db_keys = sorted(global_database.keys())
    print(f"DEBUG: Final global_database contains {len(final_db_keys)} entries before saving.")
    if len(final_db_keys) > 10: print(f"DEBUG: Final Keys sample: {final_db_keys[:5]} ... {final_db_keys[-5:]}")
    else: print(f"DEBUG: Final Keys: {final_db_keys}")

    final_output_text = text_to_use
    final_word_db_str_keys = {str(k): v for k, v in global_database.items()}
    # Access global_known_words which should be populated either initially or by loading
    final_output = {"inputText": final_output_text, "wordDatabase": final_word_db_str_keys, "segments": global_segment_database, "idioms": global_idiom_database, "knownWords": global_known_words}
    try:
        # Output to the specified file (could be the resume file or a new output)
        with open(output_file_path, 'w', encoding='utf-8') as f:
            json.dump(final_output, f, ensure_ascii=False, indent=2)
        print(f"Successfully saved processed data to '{output_file_path}'")
    except Exception as e: print(f"Error saving final data: {e}")


# --- Script Entry Point ---
if __name__ == "__main__":

    # --- Argument Parsing ---
    parser = argparse.ArgumentParser(description="Process text in batches using Gemini API.")
    parser.add_argument("-i", "--input", default=DEFAULT_INPUT_TEXT_FILE, help=f"Input text file (default: {DEFAULT_INPUT_TEXT_FILE})")
    parser.add_argument("-p", "--prompt", default=DEFAULT_PROMPT_TEMPLATE_FILE, help=f"Prompt template file (default: {DEFAULT_PROMPT_TEMPLATE_FILE})")
    parser.add_argument("-o", "--output", default=DEFAULT_OUTPUT_JSON_FILE, help=f"Output/Progress JSON file (default: {DEFAULT_OUTPUT_JSON_FILE})")
    parser.add_argument("-l", "--log-file", default=DEFAULT_FAILED_BATCHES_LOG, help=f"Log file for failed batches (default: {DEFAULT_FAILED_BATCHES_LOG})")
    # Changed default of resume_from to use the shared backend file path
    parser.add_argument("-r", "--resume-from", default=COMBINED_DATA_FILE_PATH, help=f"Path to JSON file to resume/modify (default: {COMBINED_DATA_FILE_PATH})")
    parser.add_argument("-u", "--up-to-batch", type=int, default=None, help="Process unprocessed batches only UP TO this batch number.")
    parser.add_argument("--check-status-only", action='store_true', help="Load resume file, report status, and exit without processing.")
    parser.add_argument("--reprocess-range", type=str, default=None, help="Reprocess a specific word range (e.g., '42-55'). Requires --resume-from.")
    parser.add_argument("--clear-batch", type=int, default=None, help="Reset data for a specific batch number. Requires --resume-from.")
    parser.add_argument("--clear-range", type=str, default=None, help="Reset data for a specific word range (e.g., '42-55'). Requires --resume-from.")
    parser.add_argument("--initialize-only", action='store_true', help="Tokenize input, create placeholders, calculate stats, save, and exit.")
    # New argument for specific batches
    parser.add_argument("--process-batches", type=str, default=None, help="Process specific batch numbers (comma-separated, e.g., '3,7,12'). Requires --resume-from.")
    parser.add_argument("-b", "--batch-size", type=int, default=DEFAULT_TARGET_WORDS_PER_BATCH, help=f"Target words per batch (default: {DEFAULT_TARGET_WORDS_PER_BATCH})")
    parser.add_argument("-c", "--concurrency", type=int, default=DEFAULT_MAX_CONCURRENT_API_CALLS, help=f"Max concurrent API calls (default: {DEFAULT_MAX_CONCURRENT_API_CALLS})")
    parser.add_argument("--model", default=DEFAULT_GEMINI_MODEL_NAME, help=f"Gemini model name (default: {DEFAULT_GEMINI_MODEL_NAME})")

    args = parser.parse_args() # Parse arguments into the global 'args' variable

    # --- Validate Argument Combinations ---
    # Count how many exclusive modes are selected
    mode_args = [args.check_status_only, args.reprocess_range, args.clear_batch, args.clear_range, args.up_to_batch, args.initialize_only, args.process_batches]
    selected_modes = sum(1 for arg in mode_args if arg) # Count how many are not None/False/''

    # Allow --up-to-batch OR --process-batches with --resume-from (normal resume), but not other modes
    if (args.up_to_batch or args.process_batches) and (args.check_status_only or args.reprocess_range or args.clear_batch or args.clear_range or args.initialize_only):
         exit_with_error("--up-to-batch and --process-batches cannot be used with other modes like --check-status-only, --reprocess-range, --clear-batch, --clear-range, or --initialize-only.")
    if args.up_to_batch and args.process_batches:
         exit_with_error("--up-to-batch and --process-batches cannot be used together.")
    # Check other mutually exclusive modes
    exclusive_modes = [args.check_status_only, args.reprocess_range, args.clear_batch, args.clear_range, args.initialize_only]
    selected_exclusive_modes = sum(1 for arg in exclusive_modes if arg)
    if selected_exclusive_modes > 1:
         exit_with_error("Options --check-status-only, --reprocess-range, --clear-batch, --clear-range, and --initialize-only are mutually exclusive.")


    # Check requirements for modes needing resume file
    # Note: resume_from now defaults to COMBINED_DATA_FILE_PATH, so we check if that file exists if needed
    needs_resume_file = args.check_status_only or args.reprocess_range or args.clear_batch or args.clear_range or args.process_batches or (args.resume_from and not args.initialize_only)
    if needs_resume_file and not os.path.exists(args.resume_from):
         exit_with_error(f"Required resume file '{args.resume_from}' not found for the selected mode.")

    # Check requirements for initialize only mode
    if args.initialize_only and args.resume_from != COMBINED_DATA_FILE_PATH: # Allow default resume path for initialize? No, initialize should use --input.
         exit_with_error("--initialize-only cannot be used with --resume-from (use --input for the source text).")


    # --- Determine Output Path ---
    # If output is still the default python script output AND we are resuming/modifying the backend file,
    # set the output to be the same as the resume file.
    if args.output == DEFAULT_OUTPUT_JSON_FILE and args.resume_from == COMBINED_DATA_FILE_PATH:
        args.output = COMBINED_DATA_FILE_PATH
        print(f"INFO: Output path set to backend data file: {args.output}")
    elif args.initialize_only and args.output == DEFAULT_OUTPUT_JSON_FILE:
        # If initializing and no output specified, use the backend file path
        args.output = COMBINED_DATA_FILE_PATH
        print(f"INFO: Initialize mode: Output path set to backend data file: {args.output}")
    else:
         print(f"INFO: Using specified output path: {args.output}")


    # --- Check for API Key (only if needed) ---
    # Don't need API key for initialize or check status or clear
    if not args.check_status_only and not args.initialize_only and not args.clear_batch and not args.clear_range:
        if not LLM_API_KEY or "YOUR_API_KEY" in LLM_API_KEY: # Basic check
            exit_with_error("LLM_API_KEY is not set! Please paste your API key into the script.")

    # --- Configure Gemini (Only if processing needed) ---
    # Don't need to configure Gemini if initializing, checking status, or clearing
    if not args.check_status_only and not args.initialize_only and not args.clear_batch and not args.clear_range:
        try:
            genai.configure(api_key=LLM_API_KEY)
            gemini_model = genai.GenerativeModel(args.model) # Initialize model from args
            print(f"Gemini SDK configured for model: {args.model}")
        except Exception as e:
            exit_with_error(f"Failed to configure Gemini SDK: {e}")

    # --- Load Prompt Template (Only if processing needed) ---
    # Don't need prompt if initializing, checking status, or clearing
    if not args.check_status_only and not args.initialize_only and not args.clear_batch and not args.clear_range:
        if not os.path.exists(args.prompt):
            exit_with_error(f"Prompt template file '{args.prompt}' not found.")
        try:
            with open(args.prompt, 'r', encoding='utf-8') as f:
                loaded_prompt_template = f.read()
            if not loaded_prompt_template.strip(): exit_with_error(f"Prompt template file '{args.prompt}' is empty.")
            print(f"Successfully loaded prompt template from '{args.prompt}'.")
        except Exception as e: exit_with_error(f"Error reading prompt template file: {e}")

    # --- Start Processing ---
    # Run the main async function
    try:
        asyncio.run(main_processing_logic()) # Call the main logic handler
    except Exception as main_e:
         print(f"\n--- An error occurred during processing ---")
         print(f"Error Type: {type(main_e).__name__}")
         print(f"Error Details: {main_e}")
         # Optionally add more detailed traceback logging here if needed
         # import traceback
         # traceback.print_exc()

