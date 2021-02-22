const path = require('path');

module.exports = {
    entry: './src/index.ts',
    output: {
        filename: 'index.js',
        path: path.resolve(__dirname, 'dist'),
    },
    mode: 'production',
    devServer: {
        contentBase: './dist',
        headers: {
            "Access-Control-Allow-Origin": "*",
            'Access-Control-Allow-Headers': '*',
            'Access-Control-Allow-Methods': '*',
        },
        proxy: {
            "https://pixabay.com/api": "http://localhost:8080",
        },
        https: true
    },
    module: {
        rules: [
            {
                test: /\.ts?$/,
                use: 'ts-loader',
                exclude: /node_modules/,
            },
            {
                test: /\.worker\.ts$/,
                use: { loader: 'worker-loader' }
            }
        ],
    },
    target: 'web',
    resolve: {
        extensions: ['.ts', '.js'],
    },
};