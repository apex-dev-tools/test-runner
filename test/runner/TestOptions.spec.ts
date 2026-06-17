/*
 * Copyright (c) 2026, Certinia Inc. All rights reserved.
 */

import { expect } from 'chai';
import { getOutputFileBase } from '../../src/runner/TestOptions';

describe('TestOptions', () => {
  describe('getOutputFileBase', () => {
    it('should use the supplied dir and file name when both are set', () => {
      expect(
        getOutputFileBase({
          outputDirBase: 'test-results/apex',
          outputFileName: 'reset',
        })
      ).to.deep.equal({ outputDir: 'test-results/apex', fileName: 'reset' });
    });

    it('should default when neither is set', () => {
      expect(getOutputFileBase({})).to.deep.equal({
        outputDir: '',
        fileName: 'test-result',
      });
    });

    it('should default when only the dir is set', () => {
      expect(
        getOutputFileBase({ outputDirBase: 'test-results/apex' })
      ).to.deep.equal({ outputDir: '', fileName: 'test-result' });
    });

    it('should default when only the file name is set', () => {
      expect(getOutputFileBase({ outputFileName: 'jim' })).to.deep.equal({
        outputDir: '',
        fileName: 'test-result',
      });
    });
  });
});
