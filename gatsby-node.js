import { spawn } from 'node:child_process'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import proxy from 'express-http-proxy'
import glob from 'fast-glob'
import ts from 'typescript'

const functionsDir = './functions'
const wranglerProcessStartTimeout = 10_000

const wranglerBinaryPath = fileURLToPath(new URL('../wrangler/bin/wrangler.js', import.meta.url))

// See https://developers.cloudflare.com/pages/functions/api-reference/#methods
const pagesFunctionMethods = {
  onRequestGet: 'GET',
  onRequestPost: 'POST',
  onRequestPatch: 'PATCH',
  onRequestPut: 'PUT',
  onRequestDelete: 'DELETE',
  onRequestHead: 'HEAD',
  onRequestOptions: 'OPTIONS',
}

/**
 * Converts plugin options to Wrangler CLI arguments.
 * @param options Plugin options.
 * @returns Wrangler CLI arguments.
 */
function wranglerArgs(options) {
  const args = []

  Object.entries(options).forEach(([key, value]) => {
    const arg = key.replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase()
    if (typeof value === 'boolean' && value) {
      args.push(`--${arg}`)
    } else if (Array.isArray(value)) {
      value.forEach(item => args.push(`--${arg}=${item}`))
    } else if (typeof value === 'object') {
      Object.entries(value).forEach(([subKey, subValue]) =>
        args.push(`--${arg}=${subKey}=${subValue}`)
      )
    } else if (value) {
      args.push(`--${arg}=${value}`)
    }
  })

  return args
}

/**
 * Spawns the Wrangler Pages dev server.
 *
 * @param options Plugin options.
 * @returns A promise that resolves with the Wrangler server URL or rejects with a timeout error.
 */
async function spawnWranglerPagesDev(options) {
  let wranglerHasStarted = false

  const args = ['pages', 'dev', 'static', '--port=0', ...wranglerArgs(options)]

  return new Promise((resolve, reject) => {
    const wrangler = spawn(wranglerBinaryPath, args, {
      stdio: ['pipe', 'pipe', 'pipe', 'ipc'],
    })

    wrangler.on('message', message => {
      if (!wranglerHasStarted) {
        wranglerHasStarted = true
        const parsedMessage = JSON.parse(message.toString())
        resolve(`http://${parsedMessage.ip}:${parsedMessage.port}`)
      }
    })
    wrangler.stdout?.on('data', data => console.log(data.toString()))
    wrangler.stderr?.on('data', data => console.log(data.toString()))

    // Cleanup when the process exits
    process.on('exit', () => wrangler.kill())

    setTimeout(() => {
      reject(new Error('Timed out waiting for Wrangler Pages dev server to start.'))
    }, wranglerProcessStartTimeout)
  })
}

/**
 * Extracts all exports from a TypeScript source file.
 * @param fileName The file name.
 * @returns An array of export names.
 * @see https://gist.github.com/Glavin001/6281f12ee97f40fb8fbde5a319457119
 */
function getExportsForSourceFile(fileName) {
  const allExports = []

  function visitNode(node) {
    if (ts.isExportSpecifier(node)) {
      const name = node.name.getText()
      allExports.push(name)
    } else if (node.kind === ts.SyntaxKind.ExportKeyword) {
      const { parent } = node
      if (
        ts.isFunctionDeclaration(parent) ||
        ts.isTypeAliasDeclaration(parent) ||
        ts.isInterfaceDeclaration(parent)
      ) {
        const name = parent.name.getText()
        allExports.push(name)
      } else if (ts.isVariableStatement(parent)) {
        parent.declarationList.declarations.forEach(declaration => {
          const name = declaration.name.getText()
          allExports.push(name)
        })
      }
    }

    ts.forEachChild(node, visitNode)
  }

  const sourceFile = ts.createSourceFile(
    fileName,
    readFileSync(fileName).toString(),
    ts.ScriptTarget.ES2015,
    /* setParentNodes */ true
  )

  visitNode(sourceFile)

  return allExports
}

/**
 * Gatsby's plugin options schema.
 *
 * @see https://www.gatsbyjs.com/docs/reference/config-files/gatsby-node/#pluginOptionsSchema
 * @see https://joi.dev/api/
 */
export const pluginOptionsSchema = ({ Joi }) =>
  Joi.object({
    binding: Joi.object()
      .pattern(Joi.string(), Joi.string())
      .description('Bind an environment variable or secret.'),
    kv: Joi.alternatives()
      .try(Joi.array().items(Joi.string()), Joi.string())
      .description('Binding name of KV namespace to bind.'),
    r2: Joi.alternatives()
      .try(Joi.array().items(Joi.string()), Joi.string())
      .description('Binding name of R2 bucket to bind.'),
    d1: Joi.alternatives()
      .try(Joi.array().items(Joi.string()), Joi.string())
      .description('Binding name of D1 database to bind.'),
    do: Joi.alternatives()
      .try(Joi.array().items(Joi.string()), Joi.string())
      .description('Binding name of Durable Object to bind.'),
    ai: Joi.alternatives()
      .try(Joi.array().items(Joi.string()), Joi.string())
      .description('Binding name of AI to bind.'),
    compatibilityFlag: Joi.array()
      .items(Joi.string())
      .description('Runtime compatibility flags to apply.'),
    compatibilityDate: Joi.date()
      .iso()
      .custom((value, helpers) => {
        if (value > new Date()) return helpers.error('date.future')
        return value.toISOString().slice(0, 10)
      }, 'Date in the past')
      .messages({ 'date.future': '{{#label}} must not be a future date' })
      .default(new Date().toISOString().slice(0, 10))
      .description('Runtime compatibility date to apply.'),
    logLevel: Joi.string()
      .valid('debug', 'info', 'log', 'warn', 'error', 'none')
      .default('log')
      .description("Specify Wrangler's logging level."),
  })

/**
 * Gatsby's onCreateDevServer lifecycle method.
 * Uses the provided Express app to set up routes for Cloudflare Wrangler functions.
 *
 * @see https://www.gatsbyjs.com/docs/reference/config-files/gatsby-node/#onCreateDevServer
 */
export const onCreateDevServer = async ({ app }, pluginOptions) => {
  try {
    const url = await spawnWranglerPagesDev(pluginOptions)
    const files = await glob(`${functionsDir}/**/*.{js,ts}`)
    const isLog = ['debug', 'info', 'log'].includes(pluginOptions.logLevel)

    await Promise.all(
      files.map(async file => {
        // Skip middleware.
        if (path.parse(file).name === '_middleware') return

        const exports = getExportsForSourceFile(file)
        const allMethods = exports.includes('onRequest')
        const methods = new Set(exports.map(name => pagesFunctionMethods[name]).filter(Boolean))

        // Skip if the function does not have onRequest or onRequest* methods.
        if (!allMethods && !methods.size) return

        const routePath = `/${path
          .relative(path.join(process.cwd(), functionsDir), file)
          .replace(/\.[^/.]+$/, '')
          .replace(/\[\[.+?\]\]/, '*')
          .replace(/\[(.+?)\]/, ':$1')
          .replace(/\\/g, '/')
          .replace(/\/index$/, '')}`

        const options = {
          proxyReqPathResolver: req => req.originalUrl,
          filter: req => allMethods || methods.has(req.method),
        }

        app.use(routePath, proxy(url, options))
        if (isLog) console.log(`Proxying Cloudflare function at ${routePath}`)
      })
    )
    if (isLog) console.log('')
  } catch (error) {
    console.error(error)
    process.exit(1)
  }
}
