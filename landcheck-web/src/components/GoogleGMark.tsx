type Props = {
  className?: string;
};

/** The official four-colour Google G mark used beside Google sign-in actions. */
export default function GoogleGMark({ className }: Props) {
  return (
    <svg className={className} viewBox="0 0 24 24" role="img" aria-label="Google" focusable="false">
      <path fill="#4285F4" d="M21.35 12.27c0-.79-.07-1.55-.2-2.27H12v4.3h5.24c-.23 1.4-.94 2.58-2 3.38v2.82h3.24c1.9-1.75 2.87-4.33 2.87-8.23Z" />
      <path fill="#34A853" d="M12 21.5c2.7 0 4.97-.9 6.62-2.44l-3.24-2.82c-.9.6-2.05.96-3.38.96-2.6 0-4.8-1.76-5.6-4.13H3.05v2.91A10 10 0 0 0 12 21.5Z" />
      <path fill="#FBBC05" d="M6.4 13.07A6 6 0 0 1 6.1 12c0-.37.07-.73.16-1.07V8.02H3.05A10 10 0 0 0 2 12c0 1.61.39 3.13 1.05 4.52l3.35-2.91Z" />
      <path fill="#EA4335" d="M12 6.8c1.47 0 2.8.5 3.84 1.5l2.88-2.88C16.97 3.83 14.7 2.5 12 2.5a10 10 0 0 0-8.95 5.52l3.35 2.91C7.2 8.56 9.4 6.8 12 6.8Z" />
    </svg>
  );
}
