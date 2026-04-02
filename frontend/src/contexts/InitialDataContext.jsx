import { createContext, useContext } from 'react';

const InitialDataContext = createContext(null);

export function InitialDataProvider({ data, children }) {
  return (
    <InitialDataContext.Provider value={data}>
      {children}
    </InitialDataContext.Provider>
  );
}

export function useInitialData() {
  return useContext(InitialDataContext);
}
