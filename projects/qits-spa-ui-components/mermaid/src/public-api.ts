/*
 * Public API of @qits/ui-components/mermaid: the real mermaid loader for `QITS_MERMAID_LOADER`
 * (ticket qits-1910), kept out of the main entry point so a consumer that never draws a diagram
 * never bundles mermaid's ~3.4 MB chunk.
 */
export { provideQitsMermaid } from './provide-qits-mermaid';
