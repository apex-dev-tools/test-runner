//@ts-check
'use strict';

// This is only for testing you can bundle this module

const path = require('path');
const webpack = require('webpack');

/**@type {import('webpack').Configuration}*/
const config = {
  target: 'node',
  entry: './lib/src/index.js',
  output: {
    path: path.resolve(__dirname, 'test-bundle'),
    filename: 'bundle.js',
    libraryTarget: 'commonjs2',
    devtoolModuleFilenameTemplate: '../[resource-path]',
  },
  devtool: 'source-map',
  resolve: {
    mainFields: ['main'],
    extensions: ['.js'],
  },
  ignoreWarnings: [
    {
      // ignore messages.readFile warning
      // message refs are now transformed so the require won't be called
      module: /@salesforce\/core\/lib\/messages.js/,
    },
  ],
  plugins: [
    // exclude html based cov reports to avoid adding css/image loaders
    // uses the patched module to fix context detection
    new webpack.ContextReplacementPlugin(
      /istanbul-reports[/\\]lib$/,
      /none|lcovonly|text|json/
    ),
    // ignore encoding import from node-fetch
    new webpack.IgnorePlugin({
      resourceRegExp: /^encoding$/,
      contextRegExp: /node-fetch[/\\]lib$/,
    }),
  ],
};
module.exports = config;
