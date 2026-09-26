#!/usr/bin/env node
import { launch } from '../lib/launch.mjs';
launch(process.argv.slice(2)).catch(error => { console.error(`quietline: ${error.message}`); process.exitCode = 1; });
