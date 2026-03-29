import React, { useState, useEffect } from 'react';
import './Setting.css';
import { useAlert } from '../../components/AlertProvider';

const Setting: React.FC = () => {
  const { addAlert } = useAlert();
  const [riotClientPath, setRiotClientPath] = useState('C:/Riot Games/Riot Client/RiotClientS');
  const [loginInterval, setLoginInterval] = useState('3');
  const [displayDuration, setDisplayDuration] = useState('6');
  const [apiKey, setApiKey] = useState('');
  const [autoCheckValorant, setAutoCheckValorant] = useState(false);
  const [autoCheckApp, setAutoCheckApp] = useState(false);
  const [showPythonConsole, setShowPythonConsole] = useState(false);

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      const settings = await window.electron.settings.get();
      if (settings.apiKey) setApiKey(settings.apiKey);
      if (settings.riotClientPath) setRiotClientPath(settings.riotClientPath);
      if (settings.autoCheckValorant !== undefined) setAutoCheckValorant(settings.autoCheckValorant);
      if (settings.autoCheckApp !== undefined) setAutoCheckApp(settings.autoCheckApp);
      if (settings.showPythonConsole !== undefined) setShowPythonConsole(settings.showPythonConsole);
    } catch (error) {
      console.error('Failed to load settings:', error);
    }
  };

  const handleSave = async () => {
    try {
      await window.electron.settings.save({
        apiKey,
        riotClientPath,
        autoCheckValorant,
        autoCheckApp,
        showPythonConsole,
      });
      addAlert('success', 'Settings saved!', 'Your settings have been saved successfully.');
    } catch (error) {
      console.error('Failed to save settings:', error);
      addAlert('error', 'Failed to save settings', 'An error occurred while saving your settings.');
    }
  };

  const handleReset = () => {
    setRiotClientPath('C:/Riot Games/Riot Client/RiotClientS');
    setApiKey('');
    setAutoCheckValorant(false);
    setAutoCheckApp(false);
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
