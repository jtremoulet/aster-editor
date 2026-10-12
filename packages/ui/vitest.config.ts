import { defineConfig } from 'vitest/config';
import { asterVitestConfig } from '../../vitest.shared.ts';

export default defineConfig(asterVitestConfig(70));
