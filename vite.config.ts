
  import { defineConfig } from 'vite';
  import react from '@vitejs/plugin-react-swc';
  import path from 'path';

  export default defineConfig({
    // Subpath for rysovani.vividbooks.com/rysovani-app (GitHub Pages)
    base: '/rysovani-app/',
    plugins: [react()],
    css: {
      transformer: 'lightningcss',
      lightningcss: {
        targets: {
          safari: (14 << 16),
          ios_saf: (14 << 16),
          chrome: (90 << 16),
          firefox: (90 << 16),
        },
      },
    },
    resolve: {
      // Force single copy of React for all imports (including rysovani/)
      dedupe: ['react', 'react-dom', 'sonner', 'lucide-react'],
      extensions: ['.js', '.jsx', '.ts', '.tsx', '.json'],
      alias: {
        'vaul@1.1.2': 'vaul',
        'sonner@2.0.3': 'sonner',
        'recharts@2.15.2': 'recharts',
        'react-resizable-panels@2.1.7': 'react-resizable-panels',
        'react-hook-form@7.55.0': 'react-hook-form',
        'react-day-picker@8.10.1': 'react-day-picker',
        'next-themes@0.4.6': 'next-themes',
        'lucide-react@0.487.0': 'lucide-react',
        'input-otp@1.4.2': 'input-otp',
        'embla-carousel-react@8.6.0': 'embla-carousel-react',
        'cmdk@1.1.1': 'cmdk',
        'class-variance-authority@0.7.1': 'class-variance-authority',
        '@radix-ui/react-tooltip@1.1.8': '@radix-ui/react-tooltip',
        '@radix-ui/react-toggle@1.1.2': '@radix-ui/react-toggle',
        '@radix-ui/react-toggle-group@1.1.2': '@radix-ui/react-toggle-group',
        '@radix-ui/react-tabs@1.1.3': '@radix-ui/react-tabs',
        '@radix-ui/react-switch@1.1.3': '@radix-ui/react-switch',
        '@radix-ui/react-slot@1.1.2': '@radix-ui/react-slot',
        '@radix-ui/react-slider@1.2.3': '@radix-ui/react-slider',
        '@radix-ui/react-separator@1.1.2': '@radix-ui/react-separator',
        '@radix-ui/react-select@2.1.6': '@radix-ui/react-select',
        '@radix-ui/react-scroll-area@1.2.3': '@radix-ui/react-scroll-area',
        '@radix-ui/react-radio-group@1.2.3': '@radix-ui/react-radio-group',
        '@radix-ui/react-progress@1.1.2': '@radix-ui/react-progress',
        '@radix-ui/react-popover@1.1.6': '@radix-ui/react-popover',
        '@radix-ui/react-navigation-menu@1.2.5': '@radix-ui/react-navigation-menu',
        '@radix-ui/react-menubar@1.1.6': '@radix-ui/react-menubar',
        '@radix-ui/react-label@2.1.2': '@radix-ui/react-label',
        '@radix-ui/react-hover-card@1.1.6': '@radix-ui/react-hover-card',
        '@radix-ui/react-dropdown-menu@2.1.6': '@radix-ui/react-dropdown-menu',
        '@radix-ui/react-dialog@1.1.6': '@radix-ui/react-dialog',
        '@radix-ui/react-context-menu@2.2.6': '@radix-ui/react-context-menu',
        '@radix-ui/react-collapsible@1.1.3': '@radix-ui/react-collapsible',
        '@radix-ui/react-checkbox@1.1.4': '@radix-ui/react-checkbox',
        '@radix-ui/react-avatar@1.1.3': '@radix-ui/react-avatar',
        '@radix-ui/react-aspect-ratio@1.1.2': '@radix-ui/react-aspect-ratio',
        '@radix-ui/react-alert-dialog@1.1.6': '@radix-ui/react-alert-dialog',
        '@radix-ui/react-accordion@1.2.3': '@radix-ui/react-accordion',
        '@': path.resolve(__dirname, './src'),
        '@rysovani': path.resolve(__dirname, './rysovani/src'),
        // Figma asset aliases used by rysovani components
        'figma:asset/ed8540573e6abcdff158c7f3643ed55f87c1429f.png': path.resolve(__dirname, './rysovani/src/assets/ed8540573e6abcdff158c7f3643ed55f87c1429f.png'),
        'figma:asset/7cb6453b8f9704d306161a4002715da792974ba7.png': path.resolve(__dirname, './rysovani/src/assets/7cb6453b8f9704d306161a4002715da792974ba7.png'),
        'figma:asset/6bff3ae02e2c9dca91a9d9b7cf8f34be110388ed.png': path.resolve(__dirname, './rysovani/src/assets/6bff3ae02e2c9dca91a9d9b7cf8f34be110388ed.png'),
        'figma:asset/42cb8f719f317e07f1665c59f5a654a67320cac6.png': path.resolve(__dirname, './rysovani/src/assets/42cb8f719f317e07f1665c59f5a654a67320cac6.png'),
      },
    },
    build: {
      target: ['es2020', 'safari14'],
      outDir: 'docs/rysovani-app', // Served at rysovani.vividbooks.com/rysovani-app/
      cssMinify: 'lightningcss',
    },
    server: {
      port: 3000,
      open: true,
    },
  });
