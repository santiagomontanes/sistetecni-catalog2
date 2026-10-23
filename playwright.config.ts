import {defineConfig} from '@playwright/test';
export default defineConfig({testDir:'./tests/e2e',timeout:90_000,expect:{timeout:15_000},workers:1,
 use:{baseURL:'http://127.0.0.1:3100',headless:true,actionTimeout:15_000,trace:'retain-on-failure',screenshot:'only-on-failure'},
 reporter:[['list'],['html',{open:'never'}]],
});
