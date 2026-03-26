const config = {
  layers: [
    { name: 'domain', patterns: ['src/domain/**'], canImportFrom: [] },
    { name: 'app', patterns: ['src/app/**'], canImportFrom: ['domain'] },
    { name: 'infra', patterns: ['src/infra/**'], canImportFrom: ['domain', 'app'] },
  ],
  architectureRules: {
    controllerNoDb: true,
    serviceNoHttp: true,
    maxFunctionLines: 80,
  },
  performance: {
    lowMemory: false,
    chunkSize: 40,
    maxFiles: 200,
    maxFileSizeKb: 512,
    includeSemanticDuplication: false,
  },
}

export default config
