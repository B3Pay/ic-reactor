# IC Reactor Documentation

Documentation for IC Reactor, following the [ICP JS Core](https://github.com/dfinity/icp-js-core) documentation pattern.

## Structure

This documentation setup uses TypeDoc to generate API reference documentation in Markdown format that can be integrated with the ICP Developer Portal.

```
docs/
├── package.json          # Build scripts
├── typedoc.json          # TypeDoc configuration
├── scripts/
│   └── split-index.js    # Post-processing script
└── src/content/docs/     # Manual documentation
    ├── _sidebar.json     # Navigation structure
    ├── index.mdx         # Overview
    ├── installation.mdx  # Installation guide
    ├── quick-start.mdx   # Quick start tutorial
    └── ...
```

## Building Documentation

```bash
# Install dependencies
pnpm install

# Build documentation (generates TypeDoc output)
pnpm build
```

The build process:

1. Cleans the `dist/` directory
2. Runs TypeDoc to generate API reference markdown
3. Runs `split-index.js` to process the output
4. Copies manual docs to `dist/`

## Output

Documentation is output to `dist/<version>/` and can be:

- Hosted on GitHub Pages
- Integrated with the ICP Developer Portal
- Published as a standalone documentation site

## Configuration

### TypeDoc (`typedoc.json`)

- Entry points: `@ic-reactor/core` and `@ic-reactor/react`
- Output: Markdown with frontmatter for static site generators
- Plugins: `typedoc-plugin-markdown`, `typedoc-plugin-frontmatter`

### Sidebar (`_sidebar.json`)

Defines the navigation structure following ICP docs conventions.

## Contributing

1. Manual docs go in `src/content/docs/`
2. API docs are auto-generated from TypeScript sources
3. Follow the existing frontmatter format with `editUrl: false`
