# Azure DevOps AI Analyzer Extension

AI-powered build log analysis extension for Azure DevOps.

## Extension Identity

- Extension ID: `ai-analyzer`
- Settings contribution: `aQaJoooN.ai-analyzer.settings`
- Build results contribution: `aQaJoooN.ai-analyzer.tab`

This identity replaces `aQaJoooN.azure-devops-ai-analyzer`. Azure DevOps treats it as a new extension, so previous installations and extension-scoped settings are not migrated automatically.

## Features

- **AI-Powered Analysis**: Analyze build failures using configurable AI backends
- **Two Analysis Modes**:
  - **Analyze**: Quick error-focused analysis for failed builds
  - **Super Analyze**: Comprehensive analysis including full logs and repository context
- **Project-Level Configuration**: Enable/disable the extension per project
- **Flexible AI Backend**: Works with custom Python services or any AI API endpoint
- **Persistent Results**: Analysis results are cached per build run
- **Markdown Display**: Rich formatting of analysis results

## Installation

1. Install the extension
2. Navigate to Project Settings → AI Analyzer Settings
3. Enter the complete HTTP or HTTPS URL of the OpenAI-compatible endpoint
4. Optionally enter a bearer access token
5. Enable the extension and optionally enable Super Analyze

## Usage

1. Open any build result in Azure DevOps
2. Navigate to the "AI Analyzer" tab
3. Click "Analyze" to analyze error logs (or full logs for successful builds)
4. Click "Super Analyze" (if enabled) for comprehensive analysis with repository context
5. View the AI-generated analysis results in markdown format

## Configuration

Configure the extension in Project Settings → AI Analyzer Settings:

- **Enable Extension**: Toggle to enable/disable the extension for the project
- **AI Service URL**: Complete HTTP or HTTPS OpenAI-compatible endpoint. Its CORS policy must allow the Azure DevOps origin. If Azure DevOps is loaded over HTTPS, the browser may block an HTTP endpoint as mixed content.
- **Access Token**: Optional bearer token stored separately from general settings in project-specific extension data. A fixed mask indicates that a token exists without exposing it. Keep the mask to preserve the token, clear the field to delete it, or type a new token to replace it.
- **Browser security note**: Requests are sent directly from the extension iframe, so the token is present in the browser while a request is made. Users with browser debugging access can inspect it. Use a narrowly scoped, revocable token and restrict the AI service with CORS and server-side authorization.
- **Enable Super Analyze**: Toggle to enable/disable comprehensive analysis mode

Analyze and Super Analyze requests are sent directly from the extension iframe. The AI service must handle CORS preflight requests for `POST`, `Content-Type`, and `Authorization`. HTTPS is recommended; HTTP is allowed for compatible on-premises environments.

## Project Structure

```
ai-analyzer/
├── src/
│   ├── settings/           # Project settings page
│   ├── analyzer-tab/       # AI Analyzer build results tab
│   ├── services/           # Core services
│   ├── models/             # Data models
│   └── utils/              # Utility functions
├── dist/                   # Compiled output
├── images/                 # Extension icons and images
├── vss-extension.json      # Extension manifest
├── package.json
├── tsconfig.json
└── webpack.config.js
```

## Setup

1. Install dependencies:
```bash
npm install
```

2. Build the extension:
```bash
npm run build
```

3. Package the extension:
```bash
npm run package
```

## Development

Run webpack in watch mode:
```bash
npm run dev
```

## Requirements

- Node.js 18+
- npm 8+
