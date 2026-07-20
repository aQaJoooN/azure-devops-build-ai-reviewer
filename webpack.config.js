const path = require('path');
const HtmlWebpackPlugin = require('html-webpack-plugin');

module.exports = (env, argv) => {
  const mode = argv.mode || 'development';
  const isDevelopment = mode === 'development';
  
  return {
    // Set mode for webpack optimizations
    mode: mode,
    
    // Entry points for settings page and analyzer tab
    entry: {
      settings: './src/settings/settings.ts',
      'analyzer-tab': './src/analyzer-tab/analyzer-tab.ts'
    },
    
    // Output bundle structure
    output: {
      filename: '[name].js',
      path: path.resolve(__dirname, 'dist'),
      clean: true, // Clean dist folder before each build
      publicPath: ''
    },
    
    // Module rules for processing different file types
    module: {
      rules: [
        // TypeScript loader configuration
        {
          test: /\.tsx?$/,
          use: {
            loader: 'ts-loader',
            options: {
              transpileOnly: isDevelopment, // Faster builds in dev mode
              compilerOptions: {
                sourceMap: isDevelopment
              }
            }
          },
          exclude: /node_modules/
        },
        // SCSS/CSS processing
        {
          test: /\.scss$/,
          use: [
            'style-loader', // Injects CSS into DOM
            'css-loader',   // Resolves CSS imports
            'sass-loader'   // Compiles SCSS to CSS
          ]
        },
        {
          test: /\.css$/,
          use: ['style-loader', 'css-loader']
        },
        // Image and asset processing
        {
          test: /\.(png|svg|jpg|jpeg|gif)$/i,
          type: 'asset/resource',
          generator: {
            filename: 'images/[name][ext]'
          }
        }
      ]
    },
    
    // Resolve extensions for imports
    resolve: {
      extensions: ['.tsx', '.ts', '.js', '.json'],
      alias: {
        '@services': path.resolve(__dirname, 'src/services'),
        '@models': path.resolve(__dirname, 'src/models'),
        '@utils': path.resolve(__dirname, 'src/utils')
      }
    },
    
    // HTML processing plugins
    plugins: [
      // Settings page HTML
      new HtmlWebpackPlugin({
        template: './src/settings/settings.html',
        filename: 'settings.html',
        chunks: ['settings'],
        inject: 'body',
        minify: !isDevelopment && {
          collapseWhitespace: true,
          removeComments: true,
          removeRedundantAttributes: true,
          useShortDoctype: true
        }
      }),
      // Analyzer tab HTML
      new HtmlWebpackPlugin({
        template: './src/analyzer-tab/analyzer-tab.html',
        filename: 'analyzer-tab.html',
        chunks: ['analyzer-tab'],
        inject: 'body',
        minify: !isDevelopment && {
          collapseWhitespace: true,
          removeComments: true,
          removeRedundantAttributes: true,
          useShortDoctype: true
        }
      })
    ],
    
    // Development and production build configurations
    devtool: isDevelopment ? 'source-map' : false,
    
    // Optimization settings
    optimization: {
      minimize: !isDevelopment,
      splitChunks: {
        chunks: 'all',
        cacheGroups: {
          // Vendor chunk for third-party libraries
          vendor: {
            test: /[\\/]node_modules[\\/]/,
            name: 'vendor',
            priority: 10
          },
          // Common chunk for shared code between entry points
          common: {
            minChunks: 2,
            name: 'common',
            priority: 5,
            reuseExistingChunk: true
          }
        }
      }
    },
    
    // Performance hints
    performance: {
      hints: isDevelopment ? false : 'warning',
      maxEntrypointSize: 512000,
      maxAssetSize: 512000
    },
    
    // Stats output configuration
    stats: {
      colors: true,
      modules: false,
      children: false,
      chunks: false,
      chunkModules: false
    }
  };
};
