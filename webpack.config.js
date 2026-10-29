const path = require('path');
const CopyWebpackPlugin = require('copy-webpack-plugin');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const TerserPlugin = require('terser-webpack-plugin');
const pkg = require('./package.json');

/**
 * Three bundles: the YouTube content script, the service worker and the
 * toolbar popup. `--mode` (development|production) comes from the CLI.
 */
module.exports = (_env, argv) => {
    const production = argv.mode === 'production';
    return {
        mode: production ? 'production' : 'development',
        // Extension CSP forbids eval, so no eval-based source maps.
        devtool: production ? false : 'cheap-module-source-map',
        entry: {
            contentScript: path.join(__dirname, 'src', 'pages', 'Content', 'index.js'),
            background: path.join(__dirname, 'src', 'pages', 'Background', 'index.js'),
            popup: path.join(__dirname, 'src', 'pages', 'Popup', 'index.jsx'),
        },
        output: {
            filename: '[name].bundle.js',
            path: path.resolve(__dirname, 'build'),
            clean: true,
            publicPath: '/',
        },
        module: {
            rules: [
                { test: /\.css$/, use: ['style-loader', 'css-loader'] },
                { test: /\.(png|svg|jpe?g|gif)$/, type: 'asset/resource' },
                {
                    test: /\.(js|jsx)$/,
                    exclude: /node_modules/,
                    use: {
                        loader: 'babel-loader',
                        options: { presets: ['@babel/preset-env', '@babel/preset-react'] },
                    },
                },
            ],
        },
        resolve: { extensions: ['.js', '.jsx'] },
        plugins: [
            new CopyWebpackPlugin({
                patterns: [
                    {
                        from: 'src/manifest.json',
                        // package.json is the single source of truth for version/description
                        // (newer npm no longer exports npm_package_description).
                        transform: (content) =>
                            Buffer.from(
                                JSON.stringify(
                                    {
                                        ...JSON.parse(content.toString()),
                                        description: pkg.description,
                                        version: pkg.version,
                                    },
                                    null,
                                    2
                                )
                            ),
                    },
                    { from: 'src/assets/img/icon-128.png' },
                    { from: 'src/assets/img/icon-34.png' },
                ],
            }),
            new HtmlWebpackPlugin({
                template: path.join(__dirname, 'src', 'pages', 'Popup', 'index.html'),
                filename: 'popup.html',
                chunks: ['popup'],
            }),
        ],
        optimization: {
            minimize: production,
            minimizer: [new TerserPlugin({ extractComments: false })],
        },
        performance: { hints: false },
    };
};
