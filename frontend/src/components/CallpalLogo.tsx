import { Box, Text } from '@mantine/core';
import { Link } from 'react-router-dom';

type CallpalLogoProps = {
  /** Высота иконки в px */
  iconSize?: number;
  /** Показывать подпись Callpal */
  showText?: boolean;
};

/** Логотип: разорванное кольцо (отсылка к «The Ring») + подпись Callpal */
export function CallpalLogo({ iconSize = 36, showText = true }: CallpalLogoProps) {
  return (
    <Box
      component={Link}
      to="/"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 10,
        textDecoration: 'none',
        color: 'var(--mantine-color-blue-7)',
      }}
    >
      <svg
        width={iconSize}
        height={iconSize}
        viewBox="0 0 48 48"
        aria-hidden
        style={{ flexShrink: 0 }}
      >
        <defs>
          <filter id="callpal-glow" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="1.2" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>
        {/* Внешняя дуга с разрывом */}
        <path
          d="M 24 5 A 19 19 0 1 1 10 36"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.2"
          strokeLinecap="round"
          filter="url(#callpal-glow)"
        />
        {/* Внутренний полумесяц, смещённый */}
        <path
          d="M 27 9 A 14 14 0 1 1 16 38"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          opacity={0.75}
        />
        {/* Короткая вибрирующая дуга */}
        <path
          d="M 33 14 A 9 9 0 0 0 35 30"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.2"
          strokeLinecap="round"
          opacity={0.55}
        />
        {/* Разрыв внизу — акцентная точка */}
        <circle cx="24" cy="42" r="1.2" fill="currentColor" opacity={0.4} />
      </svg>
      {showText && (
        <Text
          component="span"
          fw={600}
          size="lg"
          style={{
            fontFamily: 'Georgia, "Times New Roman", serif',
            letterSpacing: '0.14em',
            textTransform: 'uppercase',
            lineHeight: 1,
          }}
        >
          Callpal
        </Text>
      )}
    </Box>
  );
}
