// Segment filter types
export interface SegmentFilter {
  field: string;
  operator:
    | 'equals'
    | 'notEquals'
    | 'contains'
    | 'notContains'
    | 'greaterThan'
    | 'lessThan'
    | 'greaterThanOrEqual'
    | 'lessThanOrEqual'
    | 'exists'
    | 'notExists'
    | 'within';
  value?: any;
  unit?: 'days' | 'hours' | 'minutes';
}

export interface CreateSegmentData {
  name: string;
  description?: string;
  filters: SegmentFilter[];
  trackMembership?: boolean;
}

export interface UpdateSegmentData {
  name?: string;
  description?: string;
  filters?: SegmentFilter[];
  trackMembership?: boolean;
}

export interface SegmentMembershipComputeResult {
  added: number;
  removed: number;
  total: number;
}
