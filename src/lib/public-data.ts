import { unstable_cache } from 'next/cache'
import { createPublicClient } from '@/lib/supabase/public'

function resultErrorMessage(
  result: unknown
): string | null {
  if (
    !result ||
    typeof result !== 'object' ||
    !('error' in result)
  ) {
    return null
  }

  const error = (
    result as {
      error?: {
        message?: string
      } | null
    }
  ).error

  return error?.message ?? null
}

const CACHE_SECONDS = 30

export const getCachedHomePublicData = unstable_cache(
  async () => {
    const supabase = createPublicClient()

    const [
      vehicleResult,
      incidentResult,
      reportingSummaryResult,
      reportingChannelResult,
    ] = await Promise.all([
      supabase
        .from('vehicles')
        .select(`
          id,
          public_case_id,
          model,
          model_year,
          published_at
        `)
        .order('published_at', {
          ascending: false,
        }),

      supabase
        .from('incidents')
        .select(`
          id,
          vehicle_id,
          mileage,
          incident_date,
          door_positions,
          symptoms,
          repair_status
        `)
        .order('incident_date', {
          ascending: false,
        }),

      supabase.rpc(
        'get_public_reporting_summary'
      ),

      supabase.rpc(
        'get_public_reporting_channel_counts'
      ),
    ])

    const vehicles =
      vehicleResult.data ?? []

    const latestVehicleIds =
      vehicles
        .slice(0, 5)
        .map((vehicle) => vehicle.id)

    const latestReportResult =
      latestVehicleIds.length > 0
        ? await supabase.rpc(
            'get_public_case_report_channels_batch',
            {
              p_vehicle_ids: latestVehicleIds,
            }
          )
        : {
            data: [],
            error: null,
          }

    return {
      vehicles,
      incidents:
        incidentResult.data ?? [],
      latestReportRows:
        latestReportResult.data ?? [],
      reportingSummaryRows:
        reportingSummaryResult.data ?? [],
      reportingChannelRows:
        reportingChannelResult.data ?? [],

      errors: {
        vehicle:
          resultErrorMessage(vehicleResult),
        incident:
          resultErrorMessage(incidentResult),
        latestReport:
          resultErrorMessage(latestReportResult),
        reportingSummary:
          resultErrorMessage(reportingSummaryResult),
        reportingChannel:
          resultErrorMessage(reportingChannelResult),
      },
    }
  },
  ['home-public-data-v1'],
  {
    revalidate: CACHE_SECONDS,
  }
)

export const getCachedCasesPublicData = unstable_cache(
  async () => {
    const supabase = createPublicClient()

    const vehicleResult =
      await supabase
        .from('vehicles')
        .select(`
          id,
          public_case_id,
          model,
          model_year,
          moderation_status,
          published_at
        `)
        .order('published_at', {
          ascending: false,
        })

    const vehicles =
      vehicleResult.data ?? []

    const vehicleIds =
      vehicles.map(
        (vehicle) => vehicle.id
      )

    const [
      incidentResult,
      reportingResult,
    ] =
      vehicleIds.length > 0
        ? await Promise.all([
            supabase
              .from('incidents')
              .select(`
                id,
                vehicle_id,
                incident_number,
                mileage,
                incident_date,
                door_positions,
                symptoms,
                occurrence_frequency,
                repair_status,
                moderation_status
              `)
              .in(
                'vehicle_id',
                vehicleIds
              )
              .order(
                'incident_number',
                {
                  ascending: false,
                }
              ),

            supabase.rpc(
              'get_public_case_report_channels_batch',
              {
                p_vehicle_ids:
                  vehicleIds,
              }
            ),
          ])
        : [
            {
              data: [],
              error: null,
            },
            {
              data: [],
              error: null,
            },
          ]

    return {
      vehicles,
      incidents:
        incidentResult.data ?? [],
      reportingRows:
        reportingResult.data ?? [],

      errors: {
        vehicle:
          resultErrorMessage(vehicleResult),
        incident:
          resultErrorMessage(incidentResult),
        reporting:
          resultErrorMessage(reportingResult),
      },
    }
  },
  ['cases-public-data-v1'],
  {
    revalidate: CACHE_SECONDS,
  }
)

export const getCachedPublicCaseDetail =
  unstable_cache(
    async (
      publicCaseId: string
    ) => {
      const supabase =
        createPublicClient()

      const vehicleResult =
        await supabase
          .from('vehicles')
          .select(`
            id,
            public_case_id,
            model,
            model_year,
            moderation_status,
            published_at
          `)
          .eq(
            'public_case_id',
            publicCaseId
          )
          .maybeSingle()

      const vehicle =
        vehicleResult.data

      if (!vehicle) {
        return {
          vehicle: null,
          incidents: [],
          reportChannels: [],
          errors: {
            vehicle:
              resultErrorMessage(vehicleResult),
            incident: null,
            reporting: null,
          },
        }
      }

      const [
        incidentResult,
        reportingResult,
      ] = await Promise.all([
        supabase
          .from('incidents')
          .select(`
            id,
            vehicle_id,
            incident_number,
            mileage,
            incident_date,
            door_positions,
            symptoms,
            occurrence_frequency,
            dealer_visited,
            has_work_order,
            repair_status,
            has_quote,
            quoted_amount,
            moderation_status
          `)
          .eq(
            'vehicle_id',
            vehicle.id
          )
          .order(
            'incident_number',
            {
              ascending: false,
            }
          ),

        supabase.rpc(
          'get_public_case_report_channels',
          {
            p_vehicle_id:
              vehicle.id,
          }
        ),
      ])

      return {
        vehicle,
        incidents:
          incidentResult.data ?? [],
        reportChannels:
          reportingResult.data ?? [],

        errors: {
          vehicle:
            resultErrorMessage(vehicleResult),
          incident:
            resultErrorMessage(incidentResult),
          reporting:
            resultErrorMessage(reportingResult),
        },
      }
    },
    ['public-case-detail-v1'],
    {
      revalidate: CACHE_SECONDS,
    }
  )
