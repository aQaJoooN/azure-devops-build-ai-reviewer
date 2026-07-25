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

1. Install the extension from the Visual Studio Marketplace
2. Navigate to Project Settings → AI Analyzer Settings
3. Create or select a project-level Generic service connection
4. Set its Server URL to the complete OpenAI-compatible chat-completions endpoint and configure authentication in the service connection
5. Enable the extension and enter the exact service connection name
6. (Optional) Enable Super Analyze for comprehensive analysis

## Usage

1. Open any build result in Azure DevOps
2. Navigate to the "AI Analyzer" tab
3. Click "Analyze" to analyze error logs (or full logs for successful builds)
4. Click "Super Analyze" (if enabled) for comprehensive analysis with repository context
5. View the AI-generated analysis results in markdown format

## Configuration

Configure the extension in Project Settings → AI Analyzer Settings:

- **Enable Extension**: Toggle to enable/disable the extension for the project
- **Generic Service Connection Name**: Exact name of a project-level Generic service connection. This field is required when the extension is enabled.
- **Server URL**: Configure the service connection's Server URL as the complete OpenAI-compatible chat-completions endpoint.
- **Authentication**: Configure credentials only in the Azure DevOps service connection. The extension does not store or expose them.
- **Extension authorization on Azure DevOps Server**: Install or update to a version granted `vso.serviceendpoint_manage`, then approve the requested scope. User service-connection permissions do not substitute for the extension grant.
- **Enable Super Analyze**: Toggle to enable/disable comprehensive analysis mode

Analyze and Super Analyze requests are sent through the Azure DevOps service-endpoint proxy. The browser does not call the AI backend directly, avoiding browser CORS and HTTPS-to-HTTP mixed-content restrictions.

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
