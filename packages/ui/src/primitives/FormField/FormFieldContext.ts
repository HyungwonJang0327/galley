'use client';
import { createContext, useContext } from 'react';

/** FormField가 안쪽 컨트롤에 넘기는 값. Base UI Field 컨텍스트에는 required 자리가 없어 따로 둔다. */
export const FormFieldContext = createContext<{ required: boolean }>({ required: false });

/** 컨트롤에 직접 준 required가 있으면 그것을, 없으면 감싼 FormField의 required를 쓴다. */
export function useFieldRequired(own: boolean | undefined): boolean {
  const field = useContext(FormFieldContext);
  return own ?? field.required;
}
