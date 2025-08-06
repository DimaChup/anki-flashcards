# POS Languages Analysis Application

## Overview

A full-stack linguistic analysis application built with React and Express that allows users to upload, analyze, and explore linguistic data. The application provides comprehensive tools for Part-of-Speech (POS) analysis, featuring text highlighting, word frequency analysis, and known word management. Now enhanced with AI processing capabilities via Google Gemini API integration and a professional control panel for database creation and batch processing.

**Personal Account System**: The application now operates as a multi-tenant platform where each user gets their own private account with complete data isolation. Users can only access their own databases, word lists, and analysis data through secure authentication.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture
- **Framework**: React 18 with TypeScript and Vite for development/build tooling
- **UI Library**: Shadcn/ui components built on Radix UI primitives with Tailwind CSS for styling
- **State Management**: TanStack Query (React Query) for server state management and caching
- **Routing**: Wouter for lightweight client-side routing
- **Form Handling**: React Hook Form with Zod validation for type-safe form management

### Backend Architecture
- **Runtime**: Node.js with Express.js framework
- **Language**: TypeScript with ES modules
- **API Design**: RESTful API with JSON responses
- **Data Storage**: In-memory storage with interface-based design for future database integration
- **File Handling**: Multer for multipart file uploads with 10MB size limits
- **Development**: Vite integration for hot module replacement in development mode

### Data Storage Architecture
- **Current Implementation**: PostgreSQL database with Drizzle ORM for persistent storage
- **Schema Design**: Comprehensive database schema with linguistic databases, prompt templates, processing configurations, job tracking, and subscription management
- **Database Provider**: Neon Database (PostgreSQL) with connection pooling and automatic migrations
- **Multi-Tenant Architecture**: Complete user data isolation - each person has their own private databases, word lists, and learning progress that other users cannot access
- **Data Models**: 
  - **User Accounts**: Each person gets their own account through Replit Auth with secure login
  - **Personal Databases**: Each database belongs to one user only (linked by user_id)
  - **Individual Word Lists**: Known words tracking is personal to each user's databases
  - **Private Analysis Data**: POS tags, translations, and analysis results are user-specific
  - **Isolated Learning Progress**: Each user tracks their own vocabulary learning separately

### Component Architecture
- **Modular Design**: Separate components for database management, page view, and list view
- **Shared Components**: Reusable UI components (tooltips, word spans, tables)
- **Custom Hooks**: POS analyzer for linguistic categorization and mobile responsiveness detection
- **Styling System**: CSS custom properties for theme management with dark mode support

### Data Processing Pipeline
- **Upload Processing**: JSON file validation and parsing with structured error handling
- **Analysis Features**: 
  - Word frequency calculation and ranking
  - First instance detection for vocabulary learning
  - POS-based filtering and highlighting
  - Pagination for large datasets
- **AI Processing**: 
  - Google Gemini API integration for enhanced linguistic analysis
  - Batch processing with configurable prompt templates
  - Real-time job status monitoring and progress tracking
  - Python-based processing scripts with asynchronous execution
- **Export Capabilities**: CSV generation for external data analysis
- **Default Mundo Database**: Every new user gets exactly one database called "Mundo" with 70,000+ Spanish words automatically created upon registration

## External Dependencies

### Core Framework Dependencies
- **React Ecosystem**: React 18, React DOM, React Query for state management
- **Build Tools**: Vite with TypeScript support, ESBuild for production builds
- **Styling**: Tailwind CSS with PostCSS, Radix UI component primitives

### Database and Validation
- **ORM**: Drizzle ORM with PostgreSQL dialect
- **Database**: Neon Database serverless PostgreSQL
- **Validation**: Zod for runtime type checking and schema validation

### UI and Interaction
- **Component Library**: Extensive Radix UI primitives (dialogs, dropdowns, forms, etc.)
- **Icons**: Lucide React for consistent iconography
- **Utilities**: Class Variance Authority for component variants, clsx for conditional classes
- **Carousel**: Embla Carousel for interactive content display

### Development and Deployment
- **Runtime**: Node.js with Express server framework
- **File Processing**: Multer for handling file uploads
- **Session Management**: Connect-pg-simple for PostgreSQL session storage
- **Authentication**: Replit OAuth integration with comprehensive environment variable validation
- **Development Tools**: Replit-specific plugins for development environment integration
- **Deployment Configuration**: Enhanced error handling and environment variable validation for production deployments

### Utility Libraries
- **Date Handling**: date-fns for date manipulation and formatting
- **Navigation**: Wouter for lightweight routing
- **Command Interface**: cmdk for command palette functionality
- **UUID Generation**: nanoid for unique identifier creation

## Deployment Configuration

### Required Environment Variables
The application requires three critical environment variables for authentication and deployment:

- **REPLIT_DOMAINS**: Comma-separated list of domains where the app is accessible (e.g., `myapp-username.replit.app`)
- **REPL_ID**: Unique Replit application identifier for OAuth configuration
- **SESSION_SECRET**: Secure random string for session encryption (32+ characters recommended)

### Error Handling Improvements
Enhanced authentication module (`server/replitAuth.ts`) with comprehensive environment variable validation:
- Pre-startup validation of all required environment variables
- Descriptive error messages for missing configuration
- Graceful error handling in authentication endpoints
- Clear deployment guidance in error messages

### Documentation
- `DEPLOYMENT_SETUP.md`: Complete guide for setting up deployment environment variables
- `.env.example`: Template file with example environment variable configuration
- Troubleshooting guides for common deployment issues