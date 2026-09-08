import type { ComponentProps } from 'react';
import styles from './Card.module.css';

export type CardProps = ComponentProps<'div'>;

export function Card({ className, ...props }: CardProps) {
  const classes = [styles.card, className].filter(Boolean).join(' ');
  return <div className={classes} {...props} />;
}
