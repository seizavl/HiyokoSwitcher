import React, { useState, useCallback } from 'react';
import Alert from './Alert';
import './Alert.css';

export interface AlertItem {
  id: string;
  type: 'success' | 'error' | 'warning' | 'info';
  title: string;
  message: string;
}

interface AlertContextType {
  alerts: AlertItem[];
  addAlert: (type: AlertItem['type'], title: string, message: string, autoClose?: number) => void;
  removeAlert: (id: string) => void;
}

export const AlertContext = React.createContext<AlertContextType | undefined>(undefined);

export const useAlert = () => {
  const context = React.useContext(AlertContext);
  if (!context) {
    throw new Error('useAlert must be used within AlertProvider');
  }
  return context;
};

export const AlertProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [alerts, setAlerts] = useState<AlertItem[]>([]);

  const addAlert = useCallback((type: AlertItem['type'], title: string, message: string, autoClose: number = 5000) => {
    const id = crypto.randomUUID();
    setAlerts((prev) => [...prev, { id, type, title, message }]);
  }, []);

  const removeAlert = useCallback((id: string) => {
    setAlerts((prev) => prev.filter((alert) => alert.id !== id));
  }, []);

  return (
    <AlertContext.Provider value={{ alerts, addAlert, removeAlert }}>
      {children}
      <div className="alert-container">
        {alerts.map((alert) => (
          <Alert
            key={alert.id}
            type={alert.type}
            title={alert.title}
            message={alert.message}
            onClose={() => removeAlert(alert.id)}
            autoClose={5000}
          />
        ))}
      </div>
    </AlertContext.Provider>
  );
};
