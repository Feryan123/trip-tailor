// components/DebugConnection.tsx
// Create this file at: frontend/components/DebugConnection.tsx
// This is optional but helpful for testing the connection

'use client';
import { useEffect, useState } from 'react';
import { healthCheck } from '@/lib/api';

interface HealthStatus {
  status: string;
  timestamp: string;
  service: string;
  version: string;
  serpApiEnabled: boolean;
  groqApiEnabled: boolean;
}

export default function DebugConnection() {
  const [status, setStatus] = useState<string>('🔄 Checking connection...');
  const [healthData, setHealthData] = useState<HealthStatus | null>(null);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    checkConnection();
  }, []);

  const checkConnection = async () => {
    try {
      const data = await healthCheck();
      setHealthData(data);
      setStatus('✅ Backend connected successfully!');
    } catch (error: any) {
      setStatus(`❌ Connection failed: ${error.message}`);
      setHealthData(null);
    }
  };

  // Only show in development or when explicitly enabled
  if (process.env.NODE_ENV === 'production' && !isVisible) {
    return null;
  }

  return (
    <div className="fixed bottom-4 right-4 z-50">
      {!isVisible ? (
        <button
          onClick={() => setIsVisible(true)}
          className="bg-blue-500 text-white px-3 py-2 rounded-full text-sm hover:bg-blue-600 transition-colors shadow-lg"
        >
          🔧 Debug
        </button>
      ) : (
        <div className="bg-white border border-gray-200 rounded-lg shadow-lg p-4 max-w-sm">
          <div className="flex justify-between items-center mb-3">
            <h3 className="font-semibold text-gray-900">Connection Status</h3>
            <button
              onClick={() => setIsVisible(false)}
              className="text-gray-400 hover:text-gray-600"
            >
              ✕
            </button>
          </div>
          
          <div className="space-y-2 text-sm">
            <div className="font-medium">{status}</div>
            
            {healthData && (
              <div className="bg-gray-50 p-2 rounded text-xs space-y-1">
                <div><strong>Service:</strong> {healthData.service}</div>
                <div><strong>Version:</strong> {healthData.version}</div>
                <div><strong>Groq API:</strong> {healthData.groqApiEnabled ? '✅' : '❌'}</div>
                <div><strong>SerpAPI:</strong> {healthData.serpApiEnabled ? '✅' : '❌'}</div>
                <div><strong>Backend URL:</strong> {process.env.NEXT_PUBLIC_API_URL}</div>
                <div><strong>Time:</strong> {new Date(healthData.timestamp).toLocaleTimeString()}</div>
              </div>
            )}
            
            <button
              onClick={checkConnection}
              className="w-full bg-blue-500 text-white py-1 px-2 rounded text-xs hover:bg-blue-600 transition-colors"
            >
              Recheck Connection
            </button>
          </div>
        </div>
      )}
    </div>
  );
}