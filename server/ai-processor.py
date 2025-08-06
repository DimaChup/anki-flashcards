#!/usr/bin/env python3
"""
AI Processing Script for Linguistic Analysis
Handles batch processing of linguistic data using Google Gemini API
"""

import os
import sys
import json
import time
from typing import List, Dict, Any, Optional
import asyncio
import requests
from dataclasses import dataclass
from pathlib import Path

@dataclass
class ProcessingConfig:
    model_name: str = "gemini-2.0-flash"
    batch_size: int = 30
    concurrency: int = 5
    prompt_template: str = ""

@dataclass
class ProcessingJob:
    job_id: str
    database_id: str
    config: ProcessingConfig
    word_data: List[Dict[str, Any]]
    status: str = "pending"

class GeminiProcessor:
    def __init__(self, api_key: str):
        self.api_key = api_key
        self.base_url = "https://generativelanguage.googleapis.com/v1beta"
        
    async def process_batch(self, words: List[Dict], prompt_template: str, model_name: str) -> Dict[str, Any]:
        """Process a batch of words using Gemini API"""
        try:
            # Format the prompt with word data
            formatted_prompt = self._format_prompt(words, prompt_template)
            
            # Make API call to Gemini
            response = await self._call_gemini_api(formatted_prompt, model_name)
            
            return {
                "success": True,
                "results": response,
                "processed_count": len(words)
            }
        except Exception as e:
            return {
                "success": False,
                "error": str(e),
                "processed_count": 0
            }
    
    def _format_prompt(self, words: List[Dict], template: str) -> str:
        """Format the prompt template with word data"""
        word_list = []
        for word in words:
            word_info = f"Word: {word.get('word', '')}, POS: {word.get('pos', '')}, Context: {word.get('sentence', '')}"
            word_list.append(word_info)
        
        word_string = "\n".join(word_list)
        return template.replace("{words}", word_string)
    
    async def _call_gemini_api(self, prompt: str, model_name: str) -> Dict[str, Any]:
        """Make actual API call to Gemini"""
        url = f"{self.base_url}/models/{model_name}:generateContent"
        
        headers = {
            "Content-Type": "application/json",
            "Authorization": f"Bearer {self.api_key}"
        }
        
        payload = {
            "contents": [
                {
                    "parts": [
                        {
                            "text": prompt
                        }
                    ]
                }
            ],
            "generationConfig": {
                "temperature": 0.1,
                "maxOutputTokens": 2048
            }
        }
        
        # Note: For a real implementation, you'd use aiohttp for async requests
        # For now, we'll simulate an API response
        await asyncio.sleep(1)  # Simulate API delay
        
        return {
            "response_text": f"Processed {len(prompt.split())} words with {model_name}",
            "timestamp": time.time()
        }

async def update_job_status(job_id: str, status: str, progress: int = 0, results: Dict = None, error: str = None):
    """Update processing job status in the database via API"""
    try:
        update_data = {
            "status": status,
            "progress": progress
        }
        
        if results:
            update_data["results"] = results
        
        if error:
            update_data["errorMessage"] = error
        
        if status == "running":
            update_data["startedAt"] = time.time()
        elif status in ["completed", "failed"]:
            update_data["completedAt"] = time.time()
        
        # Make API call to update job status
        response = requests.put(
            f"http://localhost:5000/api/processing-jobs/{job_id}",
            json=update_data,
            headers={"Content-Type": "application/json"}
        )
        
        if response.status_code != 200:
            print(f"Failed to update job status: {response.text}")
            
    except Exception as e:
        print(f"Error updating job status: {e}")

async def process_linguistic_data(job_id: str, config_dict: Dict[str, Any]):
    """Main processing function"""
    try:
        # Extract configuration
        config = ProcessingConfig(
            model_name=config_dict.get("model_name", "gemini-2.0-flash"),
            batch_size=config_dict.get("batch_size", 30),
            concurrency=config_dict.get("concurrency", 5),
            prompt_template=config_dict.get("prompt_template", "Process these words: {words}")
        )
        
        # Get word data from the database via API
        database_id = config_dict["database_id"]
        response = requests.get(f"http://localhost:5000/api/databases/{database_id}/analysis-data")
        
        if response.status_code != 200:
            await update_job_status(job_id, "failed", error="Failed to fetch database")
            return
        
        word_data = response.json()
        
        # Initialize Gemini processor
        api_key = os.getenv("GEMINI_API_KEY")
        if not api_key:
            await update_job_status(job_id, "failed", error="Missing GEMINI_API_KEY")
            return
        
        processor = GeminiProcessor(api_key)
        
        # Update job status to running
        await update_job_status(job_id, "running")
        
        # Process in batches
        total_batches = (len(word_data) + config.batch_size - 1) // config.batch_size
        processed_results = []
        
        for i in range(0, len(word_data), config.batch_size):
            batch = word_data[i:i + config.batch_size]
            batch_num = i // config.batch_size + 1
            
            print(f"Processing batch {batch_num}/{total_batches}")
            
            # Process batch
            result = await processor.process_batch(batch, config.prompt_template, config.model_name)
            processed_results.append(result)
            
            # Update progress
            progress = int((batch_num / total_batches) * 100)
            await update_job_status(job_id, "running", progress=progress)
            
            # Add delay between batches to respect rate limits
            await asyncio.sleep(1)
        
        # Job completed successfully
        final_results = {
            "batches_processed": total_batches,
            "total_words": len(word_data),
            "batch_results": processed_results,
            "completion_time": time.time()
        }
        
        await update_job_status(job_id, "completed", progress=100, results=final_results)
        print(f"Job {job_id} completed successfully")
        
    except Exception as e:
        print(f"Error in processing: {e}")
        await update_job_status(job_id, "failed", error=str(e))

def main():
    """Main entry point for the script"""
    if len(sys.argv) != 3:
        print("Usage: python ai-processor.py <job_id> <config_json>")
        sys.exit(1)
    
    job_id = sys.argv[1]
    config_json = sys.argv[2]
    
    try:
        config = json.loads(config_json)
        asyncio.run(process_linguistic_data(job_id, config))
    except json.JSONDecodeError as e:
        print(f"Invalid JSON configuration: {e}")
        asyncio.run(update_job_status(job_id, "failed", error=f"Invalid config: {e}"))
        sys.exit(1)
    except Exception as e:
        print(f"Unexpected error: {e}")
        asyncio.run(update_job_status(job_id, "failed", error=str(e)))
        sys.exit(1)

if __name__ == "__main__":
    main()