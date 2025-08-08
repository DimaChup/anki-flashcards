import os
import google.generativeai as genai
from dotenv import load_dotenv

# --- 📝 SETUP INSTRUCTIONS ---
# 1. Install required libraries by running this in your terminal:
#    pip install google-generativeai python-dotenv
#
# 2. Create a file named .env in the same folder as this script.
#
# 3. Add your Google AI API key to the .env file like this:
#    LLM_API_KEY="your_actual_api_key_here"
# ---

# Load the API key from the .env file
load_dotenv()
api_key = os.getenv("LLM_API_KEY")

# Check if the API key was found and configure the AI
if not api_key:
    print("🔴 Error: API key not found. Please follow the setup instructions above.")
else:
    try:
        genai.configure(api_key=api_key)

        # Initialize the AI model
        model = genai.GenerativeModel('gemini-1.5-flash')

        # Get question from the user
        user_question = input("✨ Ask the AI anything: ")

        # Generate a response from the model
        print("\n🤔 Thinking...")
        response = model.generate_content(user_question)

        # Print the AI's answer
        print("\n🤖 AI says:")
        print(response.text)

    except Exception as e:
        print(f"🔴 An error occurred: {e}")
        print("This may be due to an invalid API key or a network problem.")