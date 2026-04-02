import { createContext, useContext } from 'react';

const InitialDataContext = createContext({});

export function InitialDataProvider({ initialData, children }) {
  return (
    <InitialDataContext.Provider value={initialData || {}}>
      {children}
    </InitialDataContext.Provider>
  );
}

export function useInitialData() {
  return useContext(InitialDataContext);
}
