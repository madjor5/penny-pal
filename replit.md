# Overview

FinanceChat is an AI-powered financial assistant application that enables users to interact with their personal financial data through natural language queries. The application provides a conversational interface for tracking expenses, analyzing spending patterns, managing budgets, and monitoring savings goals. Built as a full-stack web application, it combines a React-based frontend with an Express.js backend and PostgreSQL database, leveraging OpenAI's GPT-5 model to parse financial queries and generate intelligent responses.

# User Preferences

Preferred communication style: Simple, everyday language.

# System Architecture

## Frontend Architecture
The client-side is built with React 18 and TypeScript, using Vite as the build tool and development server. The UI is constructed with shadcn/ui components built on Radix UI primitives, providing a modern and accessible design system. TanStack Query handles server state management and data fetching, while Wouter provides lightweight client-side routing. The styling approach uses Tailwind CSS with custom CSS variables for theming, supporting both light and dark modes.

## Backend Architecture
The server is powered by Express.js with TypeScript, following a modular route-based architecture. The application implements a RESTful API design with dedicated endpoints for financial data operations and chat interactions. Middleware handles request logging, error management, and JSON parsing. The server integrates with OpenAI's API to provide intelligent financial query parsing and response generation.

## Database Layer
Data persistence is managed through Drizzle ORM with PostgreSQL as the primary database. The database schema includes tables for accounts, transactions, budgets, savings goals, and chat messages. Drizzle provides type-safe database operations and migrations, with connection pooling handled by Neon's serverless PostgreSQL adapter. The schema supports multiple account types (budget, expenses, savings) with relationships between entities.

## AI Integration
The application leverages OpenAI's GPT-5 model for natural language processing of financial queries. The AI system parses user messages to extract intent, parameters, and query types, then generates contextual responses based on the user's financial data. The integration supports various query types including transaction analysis, budget tracking, savings goal monitoring, and general financial insights.

## State Management
Frontend state is managed through a combination of TanStack Query for server state, React hooks for local component state, and custom hooks for shared functionality. The query client is configured with appropriate caching strategies and error handling. Toast notifications provide user feedback for actions and errors.

# External Dependencies

## Database
- **Neon PostgreSQL**: Serverless PostgreSQL database hosting with connection pooling
- **Drizzle ORM**: Type-safe database toolkit with migration support

## AI Services
- **OpenAI API**: GPT-5 model for natural language processing and financial query analysis

## UI Components
- **Radix UI**: Accessible, unstyled UI primitives for building the design system
- **shadcn/ui**: Pre-built component library based on Radix UI
- **Lucide React**: Icon library for UI elements

## Development Tools
- **Vite**: Frontend build tool and development server
- **TypeScript**: Type safety across the entire application
- **Tailwind CSS**: Utility-first CSS framework for styling
- **TanStack Query**: Server state management and data fetching
- **Wouter**: Lightweight client-side routing library

## Third-party Integrations
- **Replit Development**: Platform-specific tooling and deployment configurations
- **WebSocket Support**: Real-time capabilities through ws library for database connections