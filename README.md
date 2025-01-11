# gatsby-plugin-cloudflare-functions

Run your Cloudflare Pages Functions locally when running `gatsby develop`.

## Install

```shell
npm install gatsby-plugin-cloudflare-functions
```

## How to use

Add the plugin to your `gatsby-config.js`.

```javascript
module.exports = {
  plugins: ['gatsby-plugin-cloudflare-functions'],
}
```

It will automatically pick up the configuration from your `wrangler.toml` file.

if you don't use a `wrangler.toml` file to configure Cloudflare Pages you can also configure the
plugin via plugin options. Bindings defined here take precedence over those in your `wrangler.toml`.

See the example below which includes all available plugin options.

```javascript
module.exports = {
  plugins: [
    {
      resolve: 'gatsby-plugin-cloudflare-functions',
      options: {
        compatibilityDate: '2024-11-15',
        compatibilityFlag: ['nodejs_als'],
        binding: {
          MY_VAR: process.env.MY_VAR,
          MY_SECRET: process.env.MY_SECRET,
        },
        kv: ['MY_KV_NAMESPACE'],
        r2: ['MY_R2_BUCKET'],
        d1: ['MY_D1_DATABASE'],
        do: ['MY_DURABLE_OBJECT'],
        ai: 'MY_AI',
      },
    },
  ],
}
```

## Options

### `compatibilityDate`

Runtime compatibility date to apply.  
See <https://developers.cloudflare.com/workers/configuration/compatibility-dates/>

### `compatibilityFlag`

Runtime compatibility flags to apply.  
See <https://developers.cloudflare.com/workers/configuration/compatibility-flags/>

### `binding`

Bind environment variables or secrets.  
See <https://www.gatsbyjs.com/docs/how-to/local-development/environment-variables/> for information
on how to load environment variables from a dotenv file.

### `kv`

Binding name of KV namespace to bind.

### `r2`

Binding name of R2 bucket to bind.

### `d1`

Binding name of D1 database to bind.

### `do`

Binding name of Durable Object to bind.

### `ai`

Binding name of Workers AI to bind.
