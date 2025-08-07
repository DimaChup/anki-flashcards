# Prompt Templates Directory

This directory contains prompt templates for different languages used by the AI processing system.

## Available Templates

- `prompt_es.txt` - Spanish language analysis prompts
- `prompt_en.txt` - English language analysis prompts  
- `prompt_fr.txt` - French language analysis prompts

## Template Format

All prompt templates should:
- Use `[WORD]` as a placeholder for the word to be analyzed
- Request JSON output with consistent field names
- Include language-specific instructions
- Ensure comprehensive linguistic analysis

## Usage

These templates are used by the `process_llm.py` script with the `--prompt` parameter:

```bash
python server/process_llm.py --resume-from input.json --output output.json --model gemini-2.5-flash --prompt server/prompts/prompt_es.txt
```

## Adding New Language Templates

1. Create a new `.txt` file following the naming pattern `prompt_[language_code].txt`
2. Include the `[WORD]` placeholder
3. Define the expected JSON output structure
4. Add language-specific instructions and context