"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.adapter = void 0;
const fs_extra_1 = require("fs-extra");
const path_1 = require("path");
const child_process_1 = require("child_process");
const esbuild = __importStar(require("esbuild"));
const dotenv_1 = require("dotenv");
const fs_1 = require("fs");
const updateDotenv = require('update-dotenv');
function adapter({ artifactPath = 'build', autoDeploy = false, cdkProjectPath = `${__dirname}/deploy/index.js`, stackName = 'sveltekit-adapter-aws-webapp', esbuildOptions = {}, FQDN, LOG_RETENTION_DAYS, MEMORY_SIZE, zoneName = '', env = {}, injected = [], } = {}) {
    /** @type {import('@sveltejs/kit').Adapter} */
    return {
        name: 'adapter-awscdk',
        adapt(builder) {
            var _a, _b, _c, _d;
            return __awaiter(this, void 0, void 0, function* () {
                const environment = (0, dotenv_1.config)({ path: (0, path_1.join)(process.cwd(), '.env') });
                (0, fs_extra_1.emptyDirSync)(artifactPath);
                const static_directory = (0, path_1.join)(artifactPath, 'assets');
                if (!(0, fs_extra_1.existsSync)(static_directory)) {
                    (0, fs_extra_1.mkdirSync)(static_directory, { recursive: true });
                }
                const prerendered_directory = (0, path_1.join)(artifactPath, 'prerendered');
                if (!(0, fs_extra_1.existsSync)(prerendered_directory)) {
                    (0, fs_extra_1.mkdirSync)(prerendered_directory, { recursive: true });
                }
                const server_directory = (0, path_1.join)(artifactPath, 'server');
                if (!(0, fs_extra_1.existsSync)(server_directory)) {
                    (0, fs_extra_1.mkdirSync)(server_directory, { recursive: true });
                }
                builder.log.minor('Copying asset files.');
                const clientFiles = yield builder.writeClient(static_directory);
                builder.log.minor('Copying server files.');
                yield builder.writeServer(artifactPath);
                (0, fs_extra_1.copyFileSync)(`${__dirname}/lambda/serverless.js`, `${server_directory}/_index.js`);
                (0, fs_extra_1.copyFileSync)(`${__dirname}/lambda/shims.js`, `${server_directory}/shims.js`);
                builder.log.minor('Building AWS Lambda server function.');
                console.log({ esbuildOptions });
                console.log('plugins', esbuildOptions === null || esbuildOptions === void 0 ? void 0 : esbuildOptions.plugins);
                esbuild.buildSync({
                    entryPoints: [`${server_directory}/_index.js`],
                    outfile: `${server_directory}/index.js`,
                    inject: [...injected, (0, path_1.join)(`${server_directory}/shims.js`)],
                    external: ['node:*', ...((_a = esbuildOptions === null || esbuildOptions === void 0 ? void 0 : esbuildOptions.external) !== null && _a !== void 0 ? _a : [])],
                    format: (_b = esbuildOptions === null || esbuildOptions === void 0 ? void 0 : esbuildOptions.format) !== null && _b !== void 0 ? _b : 'cjs',
                    banner: (_c = esbuildOptions === null || esbuildOptions === void 0 ? void 0 : esbuildOptions.banner) !== null && _c !== void 0 ? _c : {},
                    bundle: true,
                    platform: 'node',
                    target: (_d = esbuildOptions === null || esbuildOptions === void 0 ? void 0 : esbuildOptions.target) !== null && _d !== void 0 ? _d : 'node16',
                    treeShaking: true,
                    // plugins: esbuildOptions?.plugins ?? [],
                });
                builder.log.minor('Prerendering static pages.');
                const prerenderedFiles = yield builder.writePrerendered(prerendered_directory);
                builder.log.minor('Cleanup project.');
                (0, fs_extra_1.unlinkSync)(`${server_directory}/_index.js`);
                (0, fs_extra_1.unlinkSync)(`${artifactPath}/index.js`);
                builder.log.minor('Exporting routes.');
                const routes = [
                    ...new Set([...clientFiles, ...prerenderedFiles]
                        .map((x) => {
                        const z = (0, path_1.dirname)(x);
                        if (z === '.')
                            return x;
                        if (z.includes('/'))
                            return undefined;
                        return `${z}/*`;
                    })
                        .filter(Boolean)),
                ];
                (0, fs_1.writeFileSync)((0, path_1.join)(artifactPath, 'routes.json'), JSON.stringify(routes));
                builder.log.minor('Deploy using AWS-CDK.');
                autoDeploy &&
                    (0, child_process_1.spawnSync)('npx', [
                        'cdk',
                        'deploy',
                        '--app',
                        cdkProjectPath,
                        '*',
                        '--require-approval',
                        'never',
                        '--outputsFile',
                        (0, path_1.join)(__dirname, 'cdk.out', 'cdk-env-vars.json'),
                    ], {
                        cwd: __dirname,
                        stdio: [process.stdin, process.stdout, process.stderr],
                        env: Object.assign({
                            PROJECT_PATH: (0, path_1.join)(process.cwd(), '.env'),
                            SERVER_PATH: (0, path_1.join)(process.cwd(), server_directory),
                            STATIC_PATH: (0, path_1.join)(process.cwd(), static_directory),
                            PRERENDERED_PATH: (0, path_1.join)(process.cwd(), prerendered_directory),
                            ROUTES: routes,
                            STACKNAME: stackName,
                            FQDN,
                            LOG_RETENTION_DAYS,
                            MEMORY_SIZE,
                            ZONE_NAME: zoneName,
                        }, process.env, env),
                    });
                try {
                    const rawData = (0, fs_extra_1.readFileSync)((0, path_1.join)(__dirname, 'cdk.out', 'cdk-env-vars.json')).toString();
                    const data = JSON.parse(rawData);
                    const out = Object.keys(data).reduce((p, n) => (Object.assign(Object.assign({}, p), Object.keys(data[n])
                        .filter((x) => !x.includes('ExportsOutput'))
                        .reduce((p, x) => {
                        p[x.toUpperCase()] = data[n][x];
                        return p;
                    }, {}))), {});
                    updateDotenv(Object.assign(Object.assign({}, environment.parsed), out));
                    (0, fs_extra_1.unlinkSync)((0, path_1.join)(__dirname, 'cdk.out', 'cdk-env-vars.json'));
                }
                catch (_e) { }
                builder.log.minor('AWS-CDK deployment done.');
            });
        },
    };
}
exports.adapter = adapter;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYWRhcHRlci5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbImFkYXB0ZXIudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7QUFBQSx1Q0FBdUc7QUFDdkcsK0JBQXFDO0FBQ3JDLGlEQUEwQztBQUMxQyxpREFBbUM7QUFDbkMsbUNBQWdDO0FBQ2hDLDJCQUFtQztBQUNuQyxNQUFNLFlBQVksR0FBRyxPQUFPLENBQUMsZUFBZSxDQUFDLENBQUM7QUFnQjlDLFNBQWdCLE9BQU8sQ0FBQyxFQUN0QixZQUFZLEdBQUcsT0FBTyxFQUN0QixVQUFVLEdBQUcsS0FBSyxFQUNsQixjQUFjLEdBQUcsR0FBRyxTQUFTLGtCQUFrQixFQUMvQyxTQUFTLEdBQUcsOEJBQThCLEVBQzFDLGNBQWMsR0FBRyxFQUFFLEVBQ25CLElBQUksRUFDSixrQkFBa0IsRUFDbEIsV0FBVyxFQUNYLFFBQVEsR0FBRyxFQUFFLEVBQ2IsR0FBRyxHQUFHLEVBQUUsRUFDUixRQUFRLEdBQUcsRUFBRSxNQUNNLEVBQUU7SUFDckIsOENBQThDO0lBQzlDLE9BQU87UUFDTCxJQUFJLEVBQUUsZ0JBQWdCO1FBQ2hCLEtBQUssQ0FBQyxPQUFZOzs7Z0JBQ3RCLE1BQU0sV0FBVyxHQUFHLElBQUEsZUFBTSxFQUFDLEVBQUUsSUFBSSxFQUFFLElBQUEsV0FBSSxFQUFDLE9BQU8sQ0FBQyxHQUFHLEVBQUUsRUFBRSxNQUFNLENBQUMsRUFBRSxDQUFDLENBQUM7Z0JBQ2xFLElBQUEsdUJBQVksRUFBQyxZQUFZLENBQUMsQ0FBQztnQkFFM0IsTUFBTSxnQkFBZ0IsR0FBRyxJQUFBLFdBQUksRUFBQyxZQUFZLEVBQUUsUUFBUSxDQUFDLENBQUM7Z0JBQ3RELElBQUksQ0FBQyxJQUFBLHFCQUFVLEVBQUMsZ0JBQWdCLENBQUMsRUFBRTtvQkFDakMsSUFBQSxvQkFBUyxFQUFDLGdCQUFnQixFQUFFLEVBQUUsU0FBUyxFQUFFLElBQUksRUFBRSxD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LE1BQU0sQ0FBQyxDQUFDLENBQU0sRUFBRSxDQUFTLEVBQUUsRUFBRTt3QkFDNUIsQ0FBQyxDQUFDLENBQUMsQ0FBQyxXQUFXLEVBQUUsQ0FBQyxHQUFHLElBQUksQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQzt3QkFDaEMsT0FBTyxDQUFDLENBQUM7b0JBQ1gsQ0FBQyxFQUFFLEVBQUUsQ0FBQyxFQUNSLEVBQ0YsRUFBRSxDQUNILENBQUM7b0JBRUYsWUFBWSxpQ0FBTSxXQUFXLENBQUMsTUFBTSxHQUFLLEdBQUcsRUFBRyxDQUFDO29CQUNoRCxJQUFBLHFCQUFVLEVBQUMsSUFBQSxXQUFJLEVBQUMsU0FBUyxFQUFFLFNBQVMsRUFBRSxtQkFBbUIsQ0FBQyxDQUFDLENBQUM7aUJBQzdEO2dCQUFDLFdBQU0sR0FBRTtnQkFFVixPQUFPLENBQUMsR0FBRyxDQUFDLEtBQUssQ0FBQywwQkFBMEIsQ0FBQyxDQUFDOztTQUMvQztLQUNGLENBQUM7QUFDSixDQUFDO0FBaEpELDBCQWdKQyIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCB7IGNvcHlGaWxlU3luYywgdW5saW5rU3luYywgZXhpc3RzU3luYywgbWtkaXJTeW5jLCBlbXB0eURpclN5bmMsIHJlYWRGaWxlU3luYyB9IGZyb20gJ2ZzLWV4dHJhJztcbmltcG9ydCB7IGpvaW4sIGRpcm5hbWUgfSBmcm9tICdwYXRoJztcbmltcG9ydCB7IHNwYXduU3luYyB9IGZyb20gJ2NoaWxkX3Byb2Nlc3MnO1xuaW1wb3J0ICogYXMgZXNidWlsZCBmcm9tICdlc2J1aWxkJztcbmltcG9ydCB7IGNvbmZpZyB9IGZyb20gJ2RvdGVudic7XG5pbXBvcnQgeyB3cml0ZUZpbGVTeW5jIH0gZnJvbSAnZnMnO1xuY29uc3QgdXBkYXRlRG90ZW52ID0gcmVxdWlyZSgndXBkYXRlLWRvdGVudicpO1xuXG5leHBvcnQgaW50ZXJmYWNlIEFXU0FkYXB0ZXJQcm9wcyB7XG4gIGFydGlmYWN0UGF0aD86IHN0cmluZztcbiAgYXV0b0RlcGxveT86IGJvb2xlYW47XG4gIGNka1Byb2plY3RQYXRoPzogc3RyaW5nO1xuICBzdGFja05hbWU/OiBzdHJpbmc7XG4gIGVzYnVpbGRPcHRpb25zPzogYW55O1xuICBGUUROPzogc3RyaW5nO1xuICBMT0dfUkVURU5USU9OX0RBWVM/OiBudW1iZXI7XG4gIE1FTU9SWV9TSVpFPzogbnVtYmVyO1xuICB6b25lTmFtZT86IHN0cmluZztcbiAgZW52PzogeyBba2V5OiBzdHJpbmddOiBzdHJpbmcgfTtcbiAgaW5qZWN0ZWQ/OiBzdHJpbmdbXTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGFkYXB0ZXIoe1xuICBhcnRpZmFjdFBhdGggPSAnYnVpbGQnLFxuICBhdXRvRGVwbG95ID0gZmFsc2UsXG4gIGNka1Byb2plY3RQYXRoID0gYCR7X19kaXJuYW1lfS9kZXBsb3kvaW5kZXguanNgLFxuICBzdGFja05hbWUgPSAnc3ZlbHRla2l0LWFkYXB0ZXItYXdzLXdlYmFwcCcsXG4gIGVzYnVpbGRPcHRpb25zID0ge30sXG4gIEZRRE4sXG4gIExPR19SRVRFTlRJT05fREFZUyxcbiAgTUVNT1JZX1NJWkUsXG4gIHpvbmVOYW1lID0gJycsXG4gIGVudiA9IHt9LFxuICBpbmplY3RlZCA9IFtdLFxufTogQVdTQWRhcHRlclByb3BzID0ge30pIHtcbiAgLyoqIEB0eXBlIHtpbXBvcnQoJ0BzdmVsdGVqcy9raXQnKS5BZGFwdGVyfSAqL1xuICByZXR1cm4ge1xuICAgIG5hbWU6ICdhZGFwdGVyLWF3c2NkaycsXG4gICAgYXN5bmMgYWRhcHQoYnVpbGRlcjogYW55KSB7XG4gICAgICBjb25zdCBlbnZpcm9ubWVudCA9IGNvbmZpZyh7IHBhdGg6IGpvaW4ocHJvY2Vzcy5jd2QoKSwgJy5lbnYnKSB9KTtcbiAgICAgIGVtcHR5RGlyU3luYyhhcnRpZmFjdFBhdGgpO1xuXG4gICAgICBjb25zdCBzdGF0aWNfZGlyZWN0b3J5ID0gam9pbihhcnRpZmFjdFBhdGgsICdhc3NldHMnKTtcbiAgICAgIGlmICghZXhpc3RzU3luYyhzdGF0aWNfZGlyZWN0b3J5KSkge1xuICAgICAgICBta2RpclN5bmMoc3RhdGljX2RpcmVjdG9yeSwgeyByZWN1cnNpdmU6IHRydWUgfSk7XG4gICAgICB9XG5cbiAgICAgIGNvbnN0IHByZXJlbmRlcmVkX2RpcmVjdG9yeSA9IGpvaW4oYXJ0aWZhY3RQYXRoLCAncHJlcmVuZGVyZWQnKTtcbiAgICAgIGlmICghZXhpc3RzU3luYyhwcmVyZW5kZXJlZF9kaXJlY3RvcnkpKSB7XG4gICAgICAgIG1rZGlyU3luYyhwcmVyZW5kZXJlZF9kaXJlY3RvcnksIHsgcmVjdXJzaXZlOiB0cnVlIH0pO1xuICAgICAgfVxuXG4gICAgICBjb25zdCBzZXJ2ZXJfZGlyZWN0b3J5ID0gam9pbihhcnRpZmFjdFBhdGgsICdzZXJ2ZXInKTtcbiAgICAgIGlmICghZXhpc3RzU3luYyhzZXJ2ZXJfZGlyZWN0b3J5KSkge1xuICAgICAgICBta2RpclN5bmMoc2VydmVyX2RpcmVjdG9yeSwgeyByZWN1cnNpdmU6IHRydWUgfSk7XG4gICAgICB9XG5cbiAgICAgIGJ1aWxkZXIubG9nLm1pbm9yKCdDb3B5aW5nIGFzc2V0IGZpbGVzLicpO1xuICAgICAgY29uc3QgY2xpZW50RmlsZXMgPSBhd2FpdCBidWlsZGVyLndyaXRlQ2xpZW50KHN0YXRpY19kaXJlY3RvcnkpO1xuXG4gICAgICBidWlsZGVyLmxvZy5taW5vcignQ29weWluZyBzZXJ2ZXIgZmlsZXMuJyk7XG4gICAgICBhd2FpdCBidWlsZGVyLndyaXRlU2VydmVyKGFydGlmYWN0UGF0aCk7XG4gICAgICBjb3B5RmlsZVN5bmMoYCR7X19kaXJuYW1lfS9sYW1iZGEvc2VydmVybGVzcy5qc2AsIGAke3NlcnZlcl9kaXJlY3Rvcnl9L19pbmRleC5qc2ApO1xuICAgICAgY29weUZpbGVTeW5jKGAke19fZGlybmFtZX0vbGFtYmRhL3NoaW1zLmpzYCwgYCR7c2VydmVyX2RpcmVjdG9yeX0vc2hpbXMuanNgKTtcblxuICAgICAgYnVpbGRlci5sb2cubWlub3IoJ0J1aWxkaW5nIEFXUyBMYW1iZGEgc2VydmVyIGZ1bmN0aW9uLicpO1xuICAgICAgY29uc29sZS5sb2coeyBlc2J1aWxkT3B0aW9ucyB9KTtcbiAgICAgIGNvbnNvbGUubG9nKCdwbHVnaW5zJywgZXNidWlsZE9wdGlvbnM/LnBsdWdpbnMpO1xuICAgICAgZXNidWlsZC5idWlsZFN5bmMoe1xuICAgICAgICBlbnRyeVBvaW50czogW2Ake3NlcnZlcl9kaXJlY3Rvcnl9L19pbmRleC5qc2BdLFxuICAgICAgICBvdXRmaWxlOiBgJHtzZXJ2ZXJfZGlyZWN0b3J5fS9pbmRleC5qc2AsXG4gICAgICAgIGluamVjdDogWy4uLmluamVjdGVkLCBqb2luKGAke3NlcnZlcl9kaXJlY3Rvcnl9L3NoaW1zLmpzYCldLFxuICAgICAgICBleHRlcm5hbDogWydub2RlOionLCAuLi4oZXNidWlsZE9wdGlvbnM/LmV4dGVybmFsID8/IFtdKV0sXG4gICAgICAgIGZvcm1hdDogZXNidWlsZE9wdGlvbnM/LmZvcm1hdCA/PyAnY2pzJyxcbiAgICAgICAgYmFubmVyOiBlc2J1aWxkT3B0aW9ucz8uYmFubmVyID8/IHt9LFxuICAgICAgICBidW5kbGU6IHRydWUsXG4gICAgICAgIHBsYXRmb3JtOiAnbm9kZScsXG4gICAgICAgIHRhcmdldDogZXNidWlsZE9wdGlvbnM/LnRhcmdldCA/PyAnbm9kZTE2JyxcbiAgICAgICAgdHJlZVNoYWtpbmc6IHRydWUsXG4gICAgICAgIC8vIHBsdWdpbnM6IGVzYnVpbGRPcHRpb25zPy5wbHVnaW5zID8/IFtdLFxuICAgICAgfSk7XG5cbiAgICAgIGJ1aWxkZXIubG9nLm1pbm9yKCdQcmVyZW5kZXJpbmcgc3RhdGljIHBhZ2VzLicpO1xuICAgICAgY29uc3QgcHJlcmVuZGVyZWRGaWxlcyA9IGF3YWl0IGJ1aWxkZXIud3JpdGVQcmVyZW5kZXJlZChwcmVyZW5kZXJlZF9kaXJlY3RvcnkpO1xuXG4gICAgICBidWlsZGVyLmxvZy5taW5vcignQ2xlYW51cCBwcm9qZWN0LicpO1xuICAgICAgdW5saW5rU3luYyhgJHtzZXJ2ZXJfZGlyZWN0b3J5fS9faW5kZXguanNgKTtcbiAgICAgIHVubGlua1N5bmMoYCR7YXJ0aWZhY3RQYXRofS9pbmRleC5qc2ApO1xuXG4gICAgICBidWlsZGVyLmxvZy5taW5vcignRXhwb3J0aW5nIHJvdXRlcy4nKTtcblxuICAgICAgY29uc3Qgcm91dGVzID0gW1xuICAgICAgICAuLi5uZXcgU2V0KFxuICAgICAgICAgIFsuLi5jbGllbnRGaWxlcywgLi4ucHJlcmVuZGVyZWRGaWxlc11cbiAgICAgICAgICAgIC5tYXAoKHgpID0+IHtcbiAgICAgICAgICAgICAgY29uc3QgeiA9IGRpcm5hbWUoeCk7XG4gICAgICAgICAgICAgIGlmICh6ID09PSAnLicpIHJldHVybiB4O1xuICAgICAgICAgICAgICBpZiAoei5pbmNsdWRlcygnLycpKSByZXR1cm4gdW5kZWZpbmVkO1xuICAgICAgICAgICAgICByZXR1cm4gYCR7en0vKmA7XG4gICAgICAgICAgICB9KVxuICAgICAgICAgICAgLmZpbHRlcihCb29sZWFuKVxuICAgICAgICApLFxuICAgICAgXTtcblxuICAgICAgd3JpdGVGaWxlU3luYyhqb2luKGFydGlmYWN0UGF0aCwgJ3JvdXRlcy5qc29uJyksIEpTT04uc3RyaW5naWZ5KHJvdXRlcykpO1xuXG4gICAgICBidWlsZGVyLmxvZy5taW5vcignRGVwbG95IHVzaW5nIEFXUy1DREsuJyk7XG4gICAgICBhdXRvRGVwbG95ICYmXG4gICAgICAgIHNwYXduU3luYyhcbiAgICAgICAgICAnbnB4JyxcbiAgICAgICAgICBbXG4gICAgICAgICAgICAnY2RrJyxcbiAgICAgICAgICAgICdkZXBsb3knLFxuICAgICAgICAgICAgJy0tYXBwJyxcbiAgICAgICAgICAgIGNka1Byb2plY3RQYXRoLFxuICAgICAgICAgICAgJyonLFxuICAgICAgICAgICAgJy0tcmVxdWlyZS1hcHByb3ZhbCcsXG4gICAgICAgICAgICAnbmV2ZXInLFxuICAgICAgICAgICAgJy0tb3V0cHV0c0ZpbGUnLFxuICAgICAgICAgICAgam9pbihfX2Rpcm5hbWUsICdjZGsub3V0JywgJ2Nkay1lbnYtdmFycy5qc29uJyksXG4gICAgICAgICAgXSxcbiAgICAgICAgICB7XG4gICAgICAgICAgICBjd2Q6IF9fZGlybmFtZSxcbiAgICAgICAgICAgIHN0ZGlvOiBbcHJvY2Vzcy5zdGRpbiwgcHJvY2Vzcy5zdGRvdXQsIHByb2Nlc3Muc3RkZXJyXSxcbiAgICAgICAgICAgIGVudjogT2JqZWN0LmFzc2lnbihcbiAgICAgICAgICAgICAge1xuICAgICAgICAgICAgICAgIFBST0pFQ1RfUEFUSDogam9pbihwcm9jZXNzLmN3ZCgpLCAnLmVudicpLFxuICAgICAgICAgICAgICAgIFNFUlZFUl9QQVRIOiBqb2luKHByb2Nlc3MuY3dkKCksIHNlcnZlcl9kaXJlY3RvcnkpLFxuICAgICAgICAgICAgICAgIFNUQVRJQ19QQVRIOiBqb2luKHByb2Nlc3MuY3dkKCksIHN0YXRpY19kaXJlY3RvcnkpLFxuICAgICAgICAgICAgICAgIFBSRVJFTkRFUkVEX1BBVEg6IGpvaW4ocHJvY2Vzcy5jd2QoKSwgcHJlcmVuZGVyZWRfZGlyZWN0b3J5KSxcbiAgICAgICAgICAgICAgICBST1VURVM6IHJvdXRlcyxcbiAgICAgICAgICAgICAgICBTVEFDS05BTUU6IHN0YWNrTmFtZSxcbiAgICAgICAgICAgICAgICBGUUROLFxuICAgICAgICAgICAgICAgIExPR19SRVRFTlRJT05fREFZUyxcbiAgICAgICAgICAgICAgICBNRU1PUllfU0laRSxcbiAgICAgICAgICAgICAgICBaT05FX05BTUU6IHpvbmVOYW1lLFxuICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgICBwcm9jZXNzLmVudixcbiAgICAgICAgICAgICAgZW52XG4gICAgICAgICAgICApLFxuICAgICAgICAgIH1cbiAgICAgICAgKTtcblxuICAgICAgdHJ5IHtcbiAgICAgICAgY29uc3QgcmF3RGF0YSA9IHJlYWRGaWxlU3luYyhqb2luKF9fZGlybmFtZSwgJ2Nkay5vdXQnLCAnY2RrLWVudi12YXJzLmpzb24nKSkudG9TdHJpbmcoKTtcbiAgICAgICAgY29uc3QgZGF0YSA9IEpTT04ucGFyc2UocmF3RGF0YSk7XG4gICAgICAgIGNvbnN0IG91dCA9IE9iamVjdC5rZXlzKGRhdGEpLnJlZHVjZShcbiAgICAgICAgICAocCwgbikgPT4gKHtcbiAgICAgICAgICAgIC4uLnAsXG4gICAgICAgICAgICAuLi5PYmplY3Qua2V5cyhkYXRhW25dKVxuICAgICAgICAgICAgICAuZmlsdGVyKCh4OiBzdHJpbmcpID0+ICF4LmluY2x1ZGVzKCdFeHBvcnRzT3V0cHV0JykpXG4gICAgICAgICAgICAgIC5yZWR1Y2UoKHA6IGFueSwgeDogc3RyaW5nKSA9PiB7XG4gICAgICAgICAgICAgICAgcFt4LnRvVXBwZXJDYXNlKCldID0gZGF0YVtuXVt4XTtcbiAgICAgICAgICAgICAgICByZXR1cm4gcDtcbiAgICAgICAgICAgICAgfSwge30pLFxuICAgICAgICAgIH0pLFxuICAgICAgICAgIHt9XG4gICAgICAgICk7XG5cbiAgICAgICAgdXBkYXRlRG90ZW52KHsgLi4uZW52aXJvbm1lbnQucGFyc2VkLCAuLi5vdXQgfSk7XG4gICAgICAgIHVubGlua1N5bmMoam9pbihfX2Rpcm5hbWUsICdjZGsub3V0JywgJ2Nkay1lbnYtdmFycy5qc29uJykpO1xuICAgICAgfSBjYXRjaCB7fVxuXG4gICAgICBidWlsZGVyLmxvZy5taW5vcignQVdTLUNESyBkZXBsb3ltZW50IGRvbmUuJyk7XG4gICAgfSxcbiAgfTtcbn1cbiJdfQ==