# Deployment Setup Guide

This guide explains how to properly configure environment variables for deploying the application.

## Required Environment Variables

The following environment variables must be configured in your deployment secrets:

### 1. REPLIT_DOMAINS
**Purpose**: Specifies the domains where your application will be accessible for authentication callbacks.
**Format**: Comma-separated list of domains
**Example**: `myapp-username.replit.app` or `myapp-username.replit.app,custom-domain.com`

**How to get this value**:
- For Replit deployments, use your deployment URL (typically `your-repl-name.replit.app`)
- For custom domains, include all domains where users will access your app

### 2. REPL_ID
**Purpose**: Your Replit application's unique identifier for OAuth configuration.
**Format**: String identifier

**How to get this value**:
- Go to your Replit workspace
- Look in the URL or use the Replit API to get your repl ID
- This is typically found in your repl's metadata

### 3. SESSION_SECRET
**Purpose**: A secret key used to sign and encrypt user sessions for security.
**Format**: Long, random string (recommended: 32+ characters)
**Example**: A random string like `your-super-secret-session-key-here-make-it-long-and-random`

**How to generate this value**:
```bash
# Generate a secure random string
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

## Setting Up Environment Variables

### For Replit Deployments:

1. Open your Replit workspace
2. Go to the "Secrets" tab (lock icon in the sidebar)
3. Add each environment variable:
   - Click "New Secret"
   - Enter the key name (e.g., `REPLIT_DOMAINS`)
   - Enter the corresponding value
   - Click "Add Secret"

### For Other Deployments:

Add these variables to your deployment platform's environment variable configuration:
- Vercel: Project Settings → Environment Variables
- Netlify: Site Settings → Environment Variables
- Railway: Project → Variables
- Heroku: Settings → Config Vars

## Troubleshooting

### Missing Environment Variables Error
If you see errors about missing environment variables:

1. **Verify all three variables are set**: Check that `REPLIT_DOMAINS`, `REPL_ID`, and `SESSION_SECRET` are all configured
2. **Check variable names**: Ensure there are no typos in the variable names
3. **Verify values**: Make sure the values are not empty or contain only whitespace
4. **Restart deployment**: After adding variables, restart your deployment

### Authentication Issues
If authentication is not working:

1. **Check REPLIT_DOMAINS**: Ensure it matches your actual deployment URL
2. **Verify REPL_ID**: Confirm this matches your actual Repl ID
3. **Test locally**: Try setting these variables locally to test the configuration

### Session Issues
If users can't stay logged in:

1. **Check SESSION_SECRET**: Ensure it's a long, random string
2. **Verify database**: Ensure the sessions table exists in your database
3. **Check cookies**: Verify that cookies are being set and received properly

## Security Notes

- **Keep SESSION_SECRET private**: Never commit this to version control
- **Use HTTPS**: Ensure your deployment uses HTTPS for secure authentication
- **Rotate secrets**: Periodically rotate your SESSION_SECRET for security
- **Limit domains**: Only include necessary domains in REPLIT_DOMAINS

## Database Requirements

The application also requires:
- `DATABASE_URL`: PostgreSQL connection string (usually auto-provided by Replit)
- A `sessions` table in your database for session storage

Make sure your database is properly migrated before deployment.