// components/MonadRunner/components/Username.tsx
import React from "react";

interface UsernameProps {
  username: string;
}

const Username: React.FC<UsernameProps> = ({ username }) => {
  return (
    <div className="absolute top-5 left-5 glass p-2 rounded-lg z-10 flex items-center space-x-2">
      <div className="w-6 h-6 bg-primary rounded-full flex items-center justify-center text-base-100 text-xs font-bold">
        {username.charAt(0).toUpperCase()}
      </div>
      <span className="font-mono text-sm">{username}</span>
    </div>
  );
};

export default Username;