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
    {
      // ignore istanbul dynamic report load as we override this
      // see src/results/coverage/LcovCoverageReporter
      module: /istanbul-reports\/index.js/,
    },
  ],
  plugins: [
    // ignore dynamic encoding import from node-fetch
    new webpack.IgnorePlugin({
      resourceRegExp: /^encoding$/,
      contextRegExp: /node-fetch[/\\]lib$/,
    }),
  ],
};
module.exports = config;
