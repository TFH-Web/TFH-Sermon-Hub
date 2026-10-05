{
  pkgs,
  config,
  ...
}: let
  cwd = "${config.git.root}/Backend";
in {
  languages.python = {
    enable = true;
    version = "3.14";
    directory = cwd;
    poetry = {
      enable = true;
      install.enable = true;
    };
  };

  packages = with pkgs; [
    sqlite
  ];

  services.redis.enable = true;

  # Send jobs to the devenv Redis instead of running them inline. Tests still run inline because conftest overrides it.
  env.REDIS_URL = "redis://localhost:6379/0";

  processes.backend = {
    inherit cwd;
    exec = "./run.sh";
  };

  processes.worker = {
    inherit cwd;
    exec = "./worker.sh";
  };

  tasks = {
    "setup:db:up" = {
      inherit cwd;
      # Existing tables can still need migrations; up.py is safe to run again.
      exec = "./up.py";
    };
    "setup:db:populate" = {
      inherit cwd;
      after = ["setup:db:up"];
      before = [
        "devenv:processes:backend"
        "test:backend"
      ];
      exec = "./populate.py";
      status = ''
        (( $(sqlite3 instance/testing.db ".mode split" "SELECT COUNT(*) FROM sermon") == 6 ))
      '';
    };

    "teardown:db" = {
      inherit cwd;
      exec = "./down.py";
    };

    "test:backend" = {
      inherit cwd;
      before = ["devenv:enterTest"];
      exec = "./test.sh";
    };
  };
}
