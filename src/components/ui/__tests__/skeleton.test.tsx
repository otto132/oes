import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';

afterEach(() => { cleanup(); });
import { Skeleton, SkeletonText, SkeletonCard, ErrorState } from '../index';

describe('Skeleton', () => {
  it('renders with animate-pulse', () => {
    const { container } = render(<Skeleton />);
    const el = container.firstChild as HTMLElement;
    expect(el.className).toContain('animate-pulse');
    expect(el.className).toContain('bg-[var(--card-hover)]');
  });

  it('merges custom className', () => {
    const { container } = render(<Skeleton className="h-8 w-32" />);
    const el = container.firstChild as HTMLElement;
    expect(el.className).toContain('h-8');
    expect(el.className).toContain('w-32');
  });
});

describe('SkeletonText', () => {
  it('renders with default h-3 w-full', () => {
    const { container } = render(<SkeletonText />);
    const el = container.firstChild as HTMLElement;
    expect(el.className).toContain('h-3');
    expect(el.className).toContain('w-full');
  });
});

describe('SkeletonCard', () => {
  it('renders with elevated background and border', () => {
    const { container } = render(<SkeletonCard />);
    const el = container.firstChild as HTMLElement;
    expect(el.className).toContain('bg-[var(--elevated)]');
    expect(el.className).toContain('border');
    expect(el.className).toContain('rounded-xl');
  });

  it('renders children', () => {
    render(<SkeletonCard><span data-testid="child">hi</span></SkeletonCard>);
    expect(screen.getByTestId('child')).toBeDefined();
  });
});

describe('ErrorState', () => {
  it('renders default message', () => {
    render(<ErrorState />);
    expect(screen.getByText('Something went wrong')).toBeDefined();
  });

  it('renders custom message', () => {
    render(<ErrorState message="Custom error" />);
    expect(screen.getByText('Custom error')).toBeDefined();
  });

  it('renders retry button when onRetry provided', () => {
    const fn = () => {};
    render(<ErrorState onRetry={fn} />);
    expect(screen.getByText('Try again')).toBeDefined();
  });

  it('does not render retry button without onRetry', () => {
    render(<ErrorState />);
    expect(screen.queryByText('Try again')).toBeNull();
  });
});
