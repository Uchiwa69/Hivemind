; HM-25 : installateur Windows de Hivemind (Inno Setup 6).
; Compilé par « npm run build:installer », qui passe AppVersion et DistDir.

#ifndef AppVersion
  #define AppVersion "1.0.0"
#endif
#ifndef DistDir
  #define DistDir "..\dist"
#endif

[Setup]
AppId={{8E3F5A52-6C1B-4B8E-9C61-2D3F1A7B9E10}
AppName=Hivemind
AppVersion={#AppVersion}
AppVerName=Hivemind {#AppVersion}
AppPublisher=Uchiwa69
AppPublisherURL=https://github.com/Uchiwa69/Hivemind
AppSupportURL=https://github.com/Uchiwa69/Hivemind/issues
VersionInfoVersion={#AppVersion}
DefaultDirName={autopf}\Hivemind
DisableProgramGroupPage=yes
OutputDir={#DistDir}
OutputBaseFilename=HivemindSetup-{#AppVersion}
SetupIconFile={#DistDir}\hivemind.ico
UninstallDisplayIcon={app}\hivemind.ico
UninstallDisplayName=Hivemind
WizardStyle=modern
Compression=lzma2/max
SolidCompression=yes
; Tous les utilisateurs (Program Files, droits administrateur) ou seulement moi, au choix.
PrivilegesRequired=admin
PrivilegesRequiredOverridesAllowed=dialog commandline
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
CloseApplications=force

[Languages]
Name: "french"; MessagesFile: "compiler:Languages\French.isl"

[Tasks]
Name: "desktopicon"; Description: "{cm:CreateDesktopIcon}"; GroupDescription: "{cm:AdditionalIcons}"; Flags: unchecked

[Files]
Source: "{#DistDir}\Hivemind.exe"; DestDir: "{app}"; Flags: ignoreversion
Source: "{#DistDir}\hivemind.ico"; DestDir: "{app}"; Flags: ignoreversion

[Icons]
; La fenêtre console (journal du serveur) démarre réduite ; la fermer arrête Hivemind.
Name: "{autoprograms}\Hivemind"; Filename: "{app}\Hivemind.exe"; WorkingDir: "{app}"; IconFilename: "{app}\hivemind.ico"; Comment: "Piloter vos IA en ligne de commande avec une mémoire commune"; Flags: runminimized
Name: "{autodesktop}\Hivemind"; Filename: "{app}\Hivemind.exe"; WorkingDir: "{app}"; IconFilename: "{app}\hivemind.ico"; Tasks: desktopicon; Flags: runminimized

[Run]
Filename: "{app}\Hivemind.exe"; Description: "{cm:LaunchProgram,Hivemind}"; WorkingDir: "{app}"; Flags: nowait postinstall skipifsilent runminimized runasoriginaluser

[UninstallRun]
; Arrête Hivemind s'il tourne, pour pouvoir supprimer l'exécutable. Les données (%APPDATA%\Hivemind) sont conservées.
Filename: "{sys}\taskkill.exe"; Parameters: "/IM Hivemind.exe /T /F"; Flags: runhidden; RunOnceId: "StopHivemind"
