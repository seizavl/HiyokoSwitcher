import React, { useState, useEffect } from 'react';
import './Setting.css';
import { useAlert } from '../../components/AlertProvider';

const MIN_LOGIN_WAIT_SECONDS = 8;
const DEFAULT_LOGIN_CLICK_POSITIONS = {
  stayButtonX: 110,
  stayButtonY: 430,
  loginButtonX: 200,
  loginButtonY: 700,
};

type LoginClickPositionKey = keyof typeof DEFAULT_LOGIN_CLICK_POSITIONS;

const LOGIN_CLICK_POSITION_FIELDS: { key: LoginClickPositionKey; label: string }[] = [
  { key: 'stayButtonX', label: '保持 X' },
  { key: 'stayButtonY', label: '保持 Y' },
  { key: 'loginButtonX', label: 'ログイン X' },
  { key: 'loginButtonY', label: 'ログイン Y' },
];

const numberText = (value: unknown, fallback: number, min?: number) => {
  const parsed = Number(value);
  const normalized = Number.isFinite(parsed) ? Math.round(parsed) : fallback;
  return String(min !== undefined ? Math.max(normalized, min) : normalized);
};

const Setting: React.FC = () => {
  const { addAlert } = useAlert();
  const [riotClientPath, setRiotClientPath] = useState('C:/Riot Games/Riot Client/RiotClientServices.exe');
  const [launchSecond, setLaunchSecond] = useState(String(MIN_LOGIN_WAIT_SECONDS));
  const [loginClickPositions, setLoginClickPositions] = useState<Record<LoginClickPositionKey, string>>({
    stayButtonX: String(DEFAULT_LOGIN_CLICK_POSITIONS.stayButtonX),
    stayButtonY: String(DEFAULT_LOGIN_CLICK_POSITIONS.stayButtonY),
    loginButtonX: String(DEFAULT_LOGIN_CLICK_POSITIONS.loginButtonX),
    loginButtonY: String(DEFAULT_LOGIN_CLICK_POSITIONS.loginButtonY),
  });
  const [apiKey, setApiKey] = useState('');
  const [autoCheckValorant, setAutoCheckValorant] = useState(false);
  const [autoCheckApp, setAutoCheckApp] = useState(false);
  const [discordRpc, setDiscordRpc] = useState(true);

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      const settings = await window.electron.settings.get();
      if (settings.apiKey) setApiKey(settings.apiKey);
      if (settings.riotClientPath) setRiotClientPath(settings.riotClientPath);
      setLaunchSecond(numberText(settings.launchSecond, MIN_LOGIN_WAIT_SECONDS, MIN_LOGIN_WAIT_SECONDS));
      setLoginClickPositions({
        stayButtonX: numberText(settings.loginClickPositions?.stayButtonX, DEFAULT_LOGIN_CLICK_POSITIONS.stayButtonX),
        stayButtonY: numberText(settings.loginClickPositions?.stayButtonY, DEFAULT_LOGIN_CLICK_POSITIONS.stayButtonY),
        loginButtonX: numberText(settings.loginClickPositions?.loginButtonX, DEFAULT_LOGIN_CLICK_POSITIONS.loginButtonX),
        loginButtonY: numberText(settings.loginClickPositions?.loginButtonY, DEFAULT_LOGIN_CLICK_POSITIONS.loginButtonY),
      });
      if (settings.autoCheckValorant !== undefined) setAutoCheckValorant(settings.autoCheckValorant);
      if (settings.autoCheckApp !== undefined) setAutoCheckApp(settings.autoCheckApp);
      if (settings.discordRpc !== undefined) setDiscordRpc(settings.discordRpc);
    } catch (error) {
      console.error('Failed to load settings:', error);
    }
  };

  const handleSave = async () => {
    try {
      const normalizedLaunchSecond = Number(numberText(launchSecond, MIN_LOGIN_WAIT_SECONDS, MIN_LOGIN_WAIT_SECONDS));
      const normalizedClickPositions = {
        stayButtonX: Number(numberText(loginClickPositions.stayButtonX, DEFAULT_LOGIN_CLICK_POSITIONS.stayButtonX)),
        stayButtonY: Number(numberText(loginClickPositions.stayButtonY, DEFAULT_LOGIN_CLICK_POSITIONS.stayButtonY)),
        loginButtonX: Number(numberText(loginClickPositions.loginButtonX, DEFAULT_LOGIN_CLICK_POSITIONS.loginButtonX)),
        loginButtonY: Number(numberText(loginClickPositions.loginButtonY, DEFAULT_LOGIN_CLICK_POSITIONS.loginButtonY)),
      };

      const current = await window.electron.settings.get();
      await window.electron.settings.save({
        ...current,
        apiKey,
        riotClientPath,
        launchSecond: normalizedLaunchSecond,
        loginClickPositions: normalizedClickPositions,
        autoCheckValorant,
        autoCheckApp,
        discordRpc,
      });
      setLaunchSecond(String(normalizedLaunchSecond));
      setLoginClickPositions({
        stayButtonX: String(normalizedClickPositions.stayButtonX),
        stayButtonY: String(normalizedClickPositions.stayButtonY),
        loginButtonX: String(normalizedClickPositions.loginButtonX),
        loginButtonY: String(normalizedClickPositions.loginButtonY),
      });
      addAlert('success', 'Settings saved!', 'Your settings have been saved successfully.');
    } catch (error) {
      console.error('Failed to save settings:', error);
      addAlert('error', 'Failed to save settings', 'An error occurred while saving your settings.');
    }
  };

  const handleReset = () => {
    setRiotClientPath('C:/Riot Games/Riot Client/RiotClientServices.exe');
    setLaunchSecond(String(MIN_LOGIN_WAIT_SECONDS));
    setLoginClickPositions({
      stayButtonX: String(DEFAULT_LOGIN_CLICK_POSITIONS.stayButtonX),
      stayButtonY: String(DEFAULT_LOGIN_CLICK_POSITIONS.stayButtonY),
      loginButtonX: String(DEFAULT_LOGIN_CLICK_POSITIONS.loginButtonX),
      loginButtonY: String(DEFAULT_LOGIN_CLICK_POSITIONS.loginButtonY),
    });
    setApiKey('');
    setAutoCheckValorant(false);
    setAutoCheckApp(false);
    setDiscordRpc(true);
    addAlert('success', 'Settings reset!', 'Your settings have been reset to default values.');
  };

  return (
    <div className="st-container">
      <div className="st-card">
        <h2 className="st-title">Settings</h2>
        <div className="settings-form">
          <div className="form-group">
            <label className="form-label">RiotClientの場所</label>
            <input
              type="text"
              className="form-input"
              value={riotClientPath}
              onChange={(e) => setRiotClientPath(e.target.value)}
            />
          </div>

          <div className="form-group">
            <label className="form-label">APIKEY (HenrikDev Systems)</label>
            <input
              type="password"
              className="form-input"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="HDEV-xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
            />
          </div>

          <div className="form-group">
            <label className="form-label">ログイン画面待機</label>
            <div className="input-with-unit">
              <input
                type="number"
                min={MIN_LOGIN_WAIT_SECONDS}
                step="1"
                className="form-input-small delay-input"
                value={launchSecond}
                onChange={(e) => setLaunchSecond(e.target.value)}
              />
              <span className="unit-label">秒</span>
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">Pythonクリック位置</label>
            <div className="position-grid">
              {LOGIN_CLICK_POSITION_FIELDS.map((field) => (
                <label className="position-field" key={field.key}>
                  <span className="position-label">{field.label}</span>
                  <input
                    type="number"
                    step="1"
                    className="form-input-small coordinate-input"
                    value={loginClickPositions[field.key]}
                    onChange={(e) =>
                      setLoginClickPositions((current) => ({
                        ...current,
                        [field.key]: e.target.value,
                      }))
                    }
                  />
                </label>
              ))}
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">Discord 連携</label>
            <div className="checkbox-group">
              <label className="checkbox-item-text">
                <input
                  type="checkbox"
                  className="checkbox-hidden"
                  checked={discordRpc}
                  onChange={(e) => setDiscordRpc(e.target.checked)}
                />
                <span className="checkbox-label">Discord にプレイ状況を表示する</span>
              </label>
            </div>
          </div>
        </div>
        <div className="button-group">
          <button className="reset-button" onClick={handleReset}>RESET</button>
          <button className="save-button" onClick={handleSave}>SAVE</button>
        </div>
      </div>
    </div>
  );
};

export default Setting;
