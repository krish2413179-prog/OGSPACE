"use client";

/**
 * SIWE authentication hook.
 * Handles nonce fetch → sign → verify → JWT storage.
 * Requirements: 1.1, 1.3
 */

import { useCallback, useState } from "react";
import { useSignMessage, useAccount } from "wagmi";
import { SiweMessage } from "siwe";
import { api } from "@/lib/api";
import { useAppStore } from "@/store/appStore";

export function useSiweAuth() {
  const { address, chainId } = useAccount();
  const { signMessageAsync } = useSignMessage();
  const setAuth = useAppStore((s) => s.setAuth);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const signIn = useCallback(async () => {
    if (!address) return;
    setIsLoading(true);
    setError(null);

    try {
      const { nonce } = await api.auth.nonce();

      const message = new SiweMessage({
        domain: window.location.host,
        address,
        statement: "Sign in to MirrorMind",
        uri: window.location.origin,
        version: "1",
        chainId: chainId ?? 16600,
        nonce,
      });

      const messageStr = message.prepareMessage();
      const signature = await signMessageAsync({ message: messageStr });

      const { token, walletAddress } = await api.auth.verify(messageStr, signature);
      setAuth(walletAddress, token);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign-in failed");
    } finally {
      setIsLoading(false);
    }
  }, [address, chainId, signMessageAsync, setAuth]);

  return { signIn, isLoading, error };
}
