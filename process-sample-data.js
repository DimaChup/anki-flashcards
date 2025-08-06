import fs from 'fs';
import fetch from 'node-fetch';
import FormData from 'form-data';

async function uploadSampleDatabaseNode() {
  try {
    const form = new FormData();
    const fileBuffer = fs.readFileSync('attached_assets/combinedData_1754441850680.json');
    form.append('jsonFile', fileBuffer, {
      filename: 'sample-spanish-database.json',
      contentType: 'application/json'
    });

    const response = await fetch('http://localhost:5000/api/databases/upload', {
      method: 'POST',
      body: form
    });

    if (response.ok) {
      const result = await response.json();
      console.log('Sample database uploaded successfully:', result.name);
      console.log('Database ID:', result.id);
      return result;
    } else {
      const error = await response.json();
      console.error('Failed to upload:', error.message);
      return null;
    }
  } catch (error) {
    console.error('Error uploading sample database:', error);
    return null;
  }
}

uploadSampleDatabaseNode();