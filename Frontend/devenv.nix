{
  pkgs,
  config,
  multiverse,
  ...
}: let
  cwd = "${config.git.root}/Frontend";
  browsers = multiverse.playwright-driver."1.58.2".browsers;
  biome = multiverse.biome."2.4.9";
in {
  env.PLAYWRIGHT_BROWSERS_PATH = browsers;
  env.PLAYWRIGHT_SKIP_VALIDATE_HOST_REQUIREMENTS = "true";
  env.BIOME_BINARY = "${biome}/bin/biome";

  packages = [
    biome
    browsers
  ];

  languages.javascript = {
    enable = true;
    npm.enable = true;
  };
  languages.typescript.enable = true;

  processes.frontend = {
    inherit cwd;
    exec = "npm run dev";
  };

  tasks = {
    "test:app:build" = {
      inherit cwd;
      exec = "npm run build";
    };
    "test:app:vitest" = {
      inherit cwd;
      after = ["test:app:build"];
      before = ["devenv:enterTest"];
      exec = "npm run test";
    };
    "test:app:e2e" = {
      inherit cwd;
      after = ["test:app:build"];
      before = ["devenv:enterTest"];
      exec = "PLAYWRIGHT_HTML_OPEN=never npm run e2e";
    };
  };

  dotenv.disableHint = true;
}
