//@ts-check
'use strict';

// This is only for testing you can bundle this module

const path = require('path');
const webpack = require('webpack');

/**@type {import('webpack').Configuration}*/
const config = {
    target: 'node',
    entry: './lib/index.js',
    output: {
        path: path.resolve(__dirname, 'test-bundle'),
        filename: 'bundle.js',
        libraryTarget: 'commonjs2',
        devtoolModuleFilenameTemplate: '../[resource-path]'
    },
    devtool: 'source-map',
    resolve: {
        mainFields: ['main'],
        extensions: ['.js']
    },
    ignoreWarnings: [
        {
            module: /@salesforce\/core\/lib\/messages.js/,
        },
    ],
};
module.exports = config;