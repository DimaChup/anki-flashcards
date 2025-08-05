# POS Languages Analysis Application

## Overview

A full-stack linguistic analysis application built with React and Express that allows users to upload, analyze, and explore linguistic data. The application provides comprehensive tools for Part-of-Speech (POS) analysis, featuring text highlighting, word frequency analysis, and known word management. It supports uploading linguistic databases in JSON format and provides both page-view and list-view interfaces for analyzing text data.

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
- **Current Implementation**: Memory-based storage using Maps for rapid prototyping
- **Schema Design**: Drizzle ORM with PostgreSQL schema definitions prepared for future database migration
- **Database Provider**: Configured for Neon Database (PostgreSQL) with connection pooling
- **Data Models**: 
  - Linguistic databases with metadata (name, language, description)
  - Word entries with POS tags, translations, frequency data, and contextual information
  - Known words tracking for user learning progress

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
- **Export Capabilities**: CSV generation for external data analysis

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
- **Development Tools**: Replit-specific plugins for development environment integration

### Utility Libraries
- **Date Handling**: date-fns for date manipulation and formatting
- **Navigation**: Wouter for lightweight routing
- **Command Interface**: cmdk for command palette functionality
- **UUID Generation**: nanoid for unique identifier creation