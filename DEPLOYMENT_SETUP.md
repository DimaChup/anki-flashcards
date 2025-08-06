# Deployment Setup Guide

This guide explains how to properly configure environment variables for deploying the application.

## Required Environment Variables

The following environment variables must be configured in your deployment secrets:

### 1. REPLIT_DOMAINS (Auto-provided by Replit)
**Purpose**: Specifies the domains where your application will be accessible for authentication callbacks.
**Format**: Comma-separated list of domains
**Status**: This should be **automatically provided** by Replit during deployment
**Example**: `myapp-username.replit.app` or `myapp-username.replit.app,custom-domain.com`

**If missing**: This variable should be automatically set by Replit. If it's missing during deployment, this indicates a platform issue.

### 2. REPL_ID (Auto-provided by Replit)
**Purpose**: Your Replit application's unique identifier for OAuth configuration.
**Format**: UUID string identifier
**Status**: This should be **automatically provided** by Replit during deployment

**If missing**: This variable should be automatically set by Replit. If it's missing during deployment, this indicates a platform issue.

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

**IMPORTANT**: Only `SESSION_SECRET` needs to be manually added. The other variables should be auto-provided.

1. Open your Replit workspace
2. Go to the "Secrets" tab (lock icon in the sidebar)  
3. Add the SESSION_SECRET:
   - Click "New Secret"
   - Enter key name: `SESSION_SECRET`
   - Enter a secure random value (generate with the command below)
   - Click "Add Secret"

**Generate SESSION_SECRET**:
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

**Note**: Do NOT manually add `REPLIT_DOMAINS` or `REPL_ID` - these should be automatically provided by Replit during deployment.

### For Other Deployments:

Add these variables to your deployment platform's environment variable configuration:
- Vercel: Project Settings → Environment Variables
- Netlify: Site Settings → Environment Variables
- Railway: Project → Variables
- Heroku: Settings → Config Vars

## Troubleshooting

### Current Deployment Error Fix

If you're getting the exact error mentioned:
```
Missing required REPLIT_DOMAINS environment variable needed for authentication configuration in server/replitAuth.ts
Missing required REPL_ID environment variable needed for OpenID Connect configuration in server/replitAuth.ts  
Missing required SESSION_SECRET environment variable needed for session storage in server/replitAuth.ts
```

**IMMEDIATE SOLUTION**:

1. **Generate a SESSION_SECRET** (run this in your terminal):
   ```bash
   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
   ```

2. **Add SESSION_SECRET to deployment secrets**:
   - Go to your Replit workspace
   - Click the "Secrets" tab (lock icon)
   - Click "New Secret"  
   - Key: `SESSION_SECRET`
   - Value: The generated string from step 1
   - Click "Add Secret"

3. **Redeploy your application** - the other variables should be auto-provided by Replit

### Missing Environment Variables Error
If you continue to see errors about missing environment variables:

1. **For SESSION_SECRET**: Must be manually added to secrets as described above
2. **For REPLIT_DOMAINS and REPL_ID**: These should be auto-provided by Replit
   - If still missing after adding SESSION_SECRET, contact Replit support
   - This may indicate a platform configuration issue
3. **Restart deployment**: After adding SESSION_SECRET, redeploy your application

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