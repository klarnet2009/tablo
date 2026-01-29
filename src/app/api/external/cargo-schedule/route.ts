import { NextRequest, NextResponse } from 'next/server';
import { externalApiRequest, isExternalApiConfigured } from '@/lib/external-api';

/**
 * Cargo schedule item from external API (based on actual response structure)
 */
interface ExternalCargoItem {
    id: number;
    editable: boolean;
    date: string;
    title: string;
    start: string;
    end: string;
    data: {
        id: number;
        order_id: number;
        status_id: number;
        localcode: string;
        order_cargo_type_id: number;
        ordertype?: {
            code: string;
            isIncoming: boolean;
        };
        transportLicensePlate?: string;
        transportTrailerPlate?: string;
        cargo_type_id?: number;
        apuscode?: string | null;
        clientcode?: string | null;
        container_number?: string | null;
        deliveryDate?: string;
        scheduledStartAt?: string;
        scheduledEndAt?: string;
        transport_provider_id?: number;
        transportprovider?: {
            id: number;
            name: string;
            orgNumberOrPersonCode?: string;
        };
        delivery_comment?: {
            comment: string;
        };
        order?: {
            id: number;
            localcode: string;
            clientcode?: string;
            partner?: {
                id: number;
                name: string;
                code?: string;
                country?: string;
            };
            to_warehouse_id?: number | null;
        };
        title?: string;
    };
    resourceId?: number;
}

/**
 * Mapped to TruckVisit-compatible format
 */
interface MappedTruckVisit {
    externalId: number;
    truckPlate: string;
    trailerPlate: string | null;
    carrier: string | null;
    orderRef: string;
    loadType: 'INBOUND' | 'OUTBOUND';
    scheduledAt: string | null;
    scheduledEnd: string | null;
    containerNumber: string | null;
    partner: string | null;
    notes: string | null;
    externalTitle: string;
}

/**
 * GET /api/external/cargo-schedule
 * Fetch cargo schedule from external API and map to TruckVisit format
 * 
 * Query params:
 * - dateFrom: Start date (ISO string)
 * - dateTo: End date (ISO string)
 * - statusIds: Comma-separated status IDs (optional)
 */
export async function GET(request: NextRequest) {
    try {
        if (!isExternalApiConfigured()) {
            return NextResponse.json(
                { error: 'External API not configured. Check environment variables.' },
                { status: 500 }
            );
        }

        const searchParams = request.nextUrl.searchParams;
        const dateFrom = searchParams.get('dateFrom');
        const dateTo = searchParams.get('dateTo');
        const statusIds = searchParams.get('statusIds');

        const params = new URLSearchParams();
        
        // Default to today only to avoid memory issues
        const today = new Date().toISOString().split('T')[0];
        
        if (dateFrom) {
            params.append('scheduledStartAt_start', dateFrom);
        } else {
            params.append('scheduledStartAt_start', today);
        }
        
        if (dateTo) {
            params.append('scheduledStartAt_end', dateTo);
        } else {
            params.append('scheduledStartAt_end', today);
        }

        if (statusIds) {
            params.append('statusIds', statusIds);
        }

        const response = await externalApiRequest<{ data: ExternalCargoItem[] }>(
            `/api/cargo-orders/schedule/incoming?${params.toString()}`
        );

        // Filter out completed/cancelled cargo (status_id 17 or 20)
        const IGNORED_STATUS_IDS = [17, 20];
        const filteredData = (response.data || []).filter(
            (item: ExternalCargoItem) => !IGNORED_STATUS_IDS.includes(item.data.status_id)
        );

        // Map external cargo data to TruckVisit-compatible format
        const truckVisits: MappedTruckVisit[] = filteredData.map((item: ExternalCargoItem) => {
            // Use transport provider as carrier, fallback to partner name
            const transportProvider = item.data.transportprovider?.name;
            const partnerName = item.data.order?.partner?.name;
            const carrier = (transportProvider && transportProvider !== '-') ? transportProvider : partnerName;
            
            return {
                externalId: item.data.id,
                truckPlate: item.data.transportLicensePlate || 'N/A',
                trailerPlate: item.data.transportTrailerPlate || null,
                carrier: carrier || null,
                orderRef: item.data.localcode,
                loadType: item.data.ordertype?.isIncoming ? 'INBOUND' : 'OUTBOUND',
                scheduledAt: item.data.scheduledStartAt || null,
                scheduledEnd: item.data.scheduledEndAt || null,
                containerNumber: item.data.container_number || null,
                partner: partnerName || null,
                notes: item.data.delivery_comment?.comment || null,
                externalTitle: item.data.title || item.title,
            };
        });

        return NextResponse.json({
            success: true,
            count: truckVisits.length,
            data: truckVisits,
        });
    } catch (error) {
        console.error('External API cargo schedule error:', error);
        return NextResponse.json(
            { error: error instanceof Error ? error.message : 'Failed to fetch cargo schedule' },
            { status: 500 }
        );
    }
}
