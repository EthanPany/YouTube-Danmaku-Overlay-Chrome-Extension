/**
 * Lets Node run the extension's src/ modules directly: webpack resolves
 * extensionless relative imports ("./match"), Node needs a hint.
 * Usage: node --import ./eval/lib/register.mjs eval/run-eval.mjs
 */
import { register } from 'node:module';

register(
    'data:text/javascript,' +
        encodeURIComponent(`
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
export async function resolve(specifier, context, next) {
    if (specifier.startsWith('.') && !/\\.[cm]?jsx?$/.test(specifier) && context.parentURL?.includes('/src/')) {
        for (const ext of ['.js', '.jsx']) {
            const url = new URL(specifier + ext, context.parentURL);
            if (existsSync(fileURLToPath(url))) return next(url.href, context);
        }
    }
    return next(specifier, context);
}`)
);
