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

  processes.backend = {
    inherit cwd;
    exec = "./run.sh";
  };

  tasks = {
    "setup:db:down" = {
      inherit cwd;
      exec = "./down.py";
    };
    "setup:db:up" = {
      inherit cwd;
      exec = "./up.py";
      status = "[[ -f instance/testing.db ]]";
    };
    "setup:db:populate" = {
      inherit cwd;
      after = ["setup:db:up"];
      before = [
        "devenv:processes:backend"
        "test:backend"
      ];
      exec = "./populate.py";
      status = "sqlite3 instance/testing.db 'SELECT * FROM sermon;'";
    };

    "test:backend" = {
      inherit cwd;
      before = ["devenv:enterTest"];
      exec = "./test.sh";
    };
  };
}
