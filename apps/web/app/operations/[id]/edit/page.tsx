import EditorPage from './EditorPage'

/**
 * The editor at its bare path, which is the Brief tab.
 *
 * The tab is a path segment rather than a query param, but it is still resolved
 * client-side from `window.location` — see `useEditorTab`. This file and
 * `[tab]/page.tsx` exist so a direct hit or a refresh on any of those paths
 * resolves to a real route; they render the same component and neither passes
 * the tab down.
 */
export default function Page() {
    return <EditorPage />
}
