/**
 * Remote-workspace selector surface, node half. Pure UI plugin: the empty apply
 * exists so the plugin appears in a profile's cordis.yml; the browser half
 * ships via the package's `./client` export.
 */

/** Host plugin body — no host-side behavior for this surface plugin. */
export function apply(): void {}
